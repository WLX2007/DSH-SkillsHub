/**
 * Live install smoke test (manual, real network): install one real SkillHub
 * skill into a temp "dshHome" and read it back. Not part of the auto suite.
 *
 * Run: node tests/install-live.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Market, installSkill, listInstalled } from '../lib/market.js'

const market = new Market()
const home = await mkdtemp(join(tmpdir(), 'skills-hub-live-'))
try {
  // 1. Search the default source for something small.
  const outcome = await market.search('pdf', 5, undefined, 'skillhub')
  assert.ok(outcome.skills.length > 0, 'the default source must answer')
  const target = outcome.skills.find(row => row.licence?.state === 'declared') ?? outcome.skills[0]
  console.log('installing:', target.name, target.id, target.licence?.state)

  // 2. Install it into the temp home's user root.
  const result = await installSkill(market, target.id, 'user', home, home, '0.3.0-live')
  console.log('installed at:', result.path, `(${result.files} files)`)

  // 3. The skill must be on disk with a real SKILL.md and provenance.
  const body = await readFile(result.path, 'utf8')
  assert.ok(body.includes('name:'), 'SKILL.md must carry frontmatter')
  const provenance = JSON.parse(await readFile(join(result.path, '..', '.skills-hub.json'), 'utf8'))
  assert.equal(provenance.id, target.id)
  assert.ok(provenance.installedAt, 'provenance must carry the timestamp')
  console.log('provenance:', provenance.provider, provenance.licence.state)

  // 4. listInstalled must report it.
  const installed = await listInstalled(home, home)
  assert.ok(installed.some(record => record.name === result.name), 'the installed skill must be listed')
  console.log('listInstalled:', installed.map(record => `${record.name}(${record.root})`).join(', '))

  // 5. A second install of the same skill must refuse (collision).
  await assert.rejects(
    () => installSkill(market, target.id, 'user', home, home, '0.3.0-live'),
    /already exists/,
  )
  console.log('collision refused as expected')
  console.log('\nLIVE INSTALL SMOKE PASSED')
} finally {
  await rm(home, { recursive: true, force: true })
}
