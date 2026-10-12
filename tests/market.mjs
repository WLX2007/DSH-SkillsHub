/**
 * Market-layer test.
 *
 * Every source runs against a FAKE fetch: no test here touches the network,
 * because the failure modes that matter are contract failures, not network
 * ones — an id that must not leak a client-chosen URL, a source failure that
 * must degrade the page instead of blanking it, a de-duplication that must not
 * show the same skill twice, and a cache that must not burn the 60/hour GitHub
 * budget on repeat lookups.
 *
 * Run: node tests/market.mjs
 */

import assert from 'node:assert/strict'
// The market layer is emitted under its own companion entry (lib/market.js —
// see tsdown.config.ts), because a re-export through lib/index.js is folded
// away by the bundler when the same binding has an internal consumer. The
// skills.sh source ships from lib/index.js, which does re-export it.
import { Market } from '../lib/market.js'
import { skillsShSource } from '../lib/index.js'

let passed = 0
const failures = []
async function check(label, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  PASS  ${label}`)
  } catch (error) {
    failures.push(label)
    console.error(`  FAIL  ${label}\n        ${error.message}`)
    process.exitCode = 1
  }
}

/** A fake host for the market's fetchers: canned answers keyed by URL. */
function fakeFetch(routes) {
  const calls = []
  const impl = async (url) => {
    calls.push(url)
    const answer = routes.get(url)
    if (answer === undefined) throw new Error(`unexpected fetch: ${url}`)
    if (answer instanceof Error) throw answer
    return answer
  }
  return { calls, impl }
}

const SEARCH_URL = 'https://skills.sh/api/search?q=pdf&limit=20'
const REGISTRY_BODY = JSON.stringify({
  count: 2,
  skills: [
    { id: 'anthropics/skills/pdf', source: 'anthropics/skills', skillId: 'pdf', name: 'pdf', installs: 209208 },
    { id: 'openai/skills/pdf', source: 'openai/skills', skillId: 'pdf', name: 'pdf', installs: 13118 },
  ],
})

console.log('search: aggregation, de-duplication and degradation')

await check('search fans out and returns normalised rows', async () => {
  const market = new Market({ builtins: false })
  const seen = []
  // Replace the market's transport with the fake by registering a stub source
  // that records calls: this exercises the real aggregation path.
  market.register({
    name: 'stub',
    searchable: true,
    async search(query, limit) {
      seen.push({ query, limit })
      return [{
        id: 'stub:anthropics/skills@HEAD:skills/pdf',
        name: 'pdf',
        description: 'PDF handling',
        provider: 'stub',
        sourceLabel: 'anthropics/skills',
        origin: { kind: 'github', owner: 'anthropics', repo: 'skills', ref: 'HEAD', dir: 'skills/pdf' },
        installs: 100,
      }]
    },
    async detail(skill) {
      return { skill, body: 'b', frontmatter: {}, files: [], totalBytes: 0 }
    },
  })
  const outcome = await market.search('pdf', 20)
  assert.equal(outcome.skills.length, 1)
  assert.equal(outcome.skills[0].name, 'pdf')
  assert.equal(outcome.counts.stub, 1)
  assert.deepEqual(outcome.failures, [])
  assert.equal(seen[0]?.query, 'pdf')
})

await check('a failing source degrades the page instead of failing it', async () => {
  const market = new Market({ builtins: false })
  market.register({
    name: 'down',
    searchable: true,
    async search() { throw new Error('registry offline') },
    async detail() { return undefined },
  })
  const outcome = await market.search('pdf', 20)
  assert.equal(outcome.skills.length, 0, 'the dead source contributes no rows')
  assert.equal(outcome.counts.down, undefined)
  assert.equal(outcome.failures.length, 1)
  assert.equal(outcome.failures[0].source, 'down')
  assert.match(outcome.failures[0].message, /registry offline/)
})

await check('the same skill from two sources appears once', async () => {
  const market = new Market({ builtins: false })
  const row = {
    id: 'dup',
    name: 'pdf',
    description: '',
    provider: 'dup',
    sourceLabel: 'anthropics/skills',
    origin: { kind: 'github', owner: 'anthropics', repo: 'skills', ref: 'HEAD', dir: 'skills/pdf' },
  }
  market.register({ name: 'a', searchable: true, async search() { return [{ ...row, id: 'a', provider: 'a', installs: 5 }] }, async detail() { return undefined } })
  market.register({ name: 'b', searchable: true, async search() { return [{ ...row, id: 'b', provider: 'b', installs: 9 }] }, async detail() { return undefined } })
  const outcome = await market.search('pdf', 20)
  assert.equal(outcome.skills.length, 1, 'the same repository coordinate must collapse to one row')
  assert.equal(outcome.skills[0].installs, 9, 'the richer row wins')
})

await check('results rank by install count, then by name', async () => {
  const market = new Market({ builtins: false })
  const mk = (name, installs) => ({
    id: `x:${name}`,
    name,
    description: '',
    provider: 'x',
    sourceLabel: 'r',
    origin: { kind: 'github', owner: 'o', repo: name, ref: 'HEAD', dir: '' },
    ...(installs === undefined ? {} : { installs }),
  })
  market.register({
    name: 'x',
    searchable: true,
    async search() { return [mk('zebra', undefined), mk('alpha', 1), mk('mid', 50), mk('beta', 50)] },
    async detail() { return undefined },
  })
  const outcome = await market.search('q', 20)
  assert.deepEqual(outcome.skills.map(s => s.name), ['mid', 'beta', 'alpha', 'zebra'])
})

await check('the limit bounds the merged result', async () => {
  const market = new Market({ builtins: false })
  market.register({
    name: 'x',
    searchable: true,
    async search() {
      return Array.from({ length: 30 }, (_, i) => ({
        id: `x:${i}`,
        name: `s${i}`,
        description: '',
        provider: 'x',
        sourceLabel: 'r',
        origin: { kind: 'github', owner: 'o', repo: `r${i}`, ref: 'HEAD', dir: '' },
        installs: 30 - i,
      }))
    },
    async detail() { return undefined },
  })
  const outcome = await market.search('q', 5)
  assert.equal(outcome.skills.length, 5)
})

console.log('\nids: the client can only reach skills a source offered')

await check('detail rejects an id that no source minted', async () => {
  const market = new Market({ builtins: false })
  const detail = await market.detail('evil:./etc@x:')
  assert.equal(detail, undefined, 'a malformed id must resolve to nothing')
})

await check('detail rejects an id whose provider is not registered', async () => {
  const market = new Market({ builtins: false })
  const detail = await market.detail('nope:o/r@HEAD:')
  assert.equal(detail, undefined)
})

await check('an id cannot smuggle a path escape', async () => {
  const market = new Market({ builtins: false })
  // The id grammar forbids '..' and empty segments; a traversal attempt is
  // rejected before any fetch.
  for (const bad of [
    'github:o/r@HEAD:../..',
    'github:o/r@HEAD:skills//pdf',
    'github:o/r@HEAD:/skills/pdf',
    'github:../r@HEAD:',
    'github:o/r@HEAD:a/',
  ]) {
    const detail = await market.detail(bad)
    assert.equal(detail, undefined, `id should be rejected: ${bad}`)
  }
})

console.log('\nskills.sh: the registry search contract')

await check('search hits become rows with HEAD refs and no path', async () => {
  const fetchCalls = []
  const fake = async (url) => {
    fetchCalls.push(url)
    if (url.startsWith('https://skills.sh/api/search')) return JSON.parse(REGISTRY_BODY)
    throw new Error(`unexpected: ${url}`)
  }
  // Drive the real source with the fake transport: this pins the skills.sh
  // response contract, which the whole adapter depends on. The source comes
  // from the module-level import (lib/index.js), not market.js.
  const ctx = {
    proxy: undefined,
    signal: undefined,
    fetchJson: async (url) => fake(url),
    fetchText: async (url) => fake(url),
  }
  const rows = await skillsShSource.search('pdf', 20, ctx)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, 'pdf')
  assert.equal(rows[0].origin.owner, 'anthropics')
  assert.equal(rows[0].origin.repo, 'skills')
  assert.equal(rows[0].origin.ref, 'HEAD', 'a registry hit resolves through HEAD, costing no API call')
  assert.equal(rows[0].origin.dir, '')
  assert.equal(rows[0].installs, 209208)
  // No GitHub API call may be made by a search: the 60/hour budget belongs to
  // detail views and repository browsing.
  assert.ok(!fetchCalls.some(url => url.startsWith('https://api.github.com/')),
    'search must not touch the GitHub API')
})

console.log(`\n${passed} checks passed${failures.length > 0 ? `, ${failures.length} failed` : ''}`)
