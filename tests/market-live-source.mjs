/**
 * Live smoke test for the named-source search.
 *
 * Deliberately NOT part of the automated suite: it touches the real network.
 * Run by hand. Verifies that a search pinned to one source asks that source
 * alone, and that the answer carries only its rows.
 *
 * Run: node tests/market-live-source.mjs [source] [query]
 */

import { Market } from '../lib/market.js'

const source = process.argv[2] ?? 'skills-sh'
const query = process.argv[3] ?? 'pdf'

const market = new Market()
const outcome = await market.search(query, 8, undefined, source)

console.log(`search "${query}" pinned to "${source}":`)
console.log(`  counts: ${JSON.stringify(outcome.counts)}`)
console.log(`  failures: ${outcome.failures.length}`)
for (const skill of outcome.skills) {
  const installs = skill.installs !== undefined ? String(skill.installs).padStart(8) : '(none)'
  console.log(`   ${installs}  ${skill.name.padEnd(28)} ${skill.provider}`)
}

const strays = outcome.skills.filter(skill => skill.provider !== source)
if (strays.length > 0) {
  console.error(`FAIL: ${strays.length} row(s) leaked from another source: ${[...new Set(strays.map(row => row.provider))].join(', ')}`)
  process.exit(1)
}
console.log(`\nOK: all ${outcome.skills.length} row(s) came from "${source}"`)
