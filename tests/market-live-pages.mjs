/**
 * Live smoke test for paged search.
 *
 * Deliberately NOT part of the automated suite: it touches the real network.
 * Run by hand. Verifies that "load more" genuinely reaches a second page —
 * the rows of page 2 must differ from page 1's — and that the end state is
 * reported rather than implied.
 *
 * Run: node tests/market-live-pages.mjs [query]
 */

import { Market } from '../lib/market.js'

const query = process.argv[2] ?? 'pdf'
const market = new Market()

const page1 = await market.search(query, 5, undefined, 'skillhub', 1)
console.log(`page 1: ${page1.skills.length} rows, hasMore=${page1.hasMore}`)
for (const skill of page1.skills) console.log(`   ${skill.name}`)

if (!page1.hasMore) {
  console.log('\nthe source reports no second page; nothing further to verify')
  process.exit(0)
}

const page2 = await market.search(query, 5, undefined, 'skillhub', 2)
console.log(`\npage 2: ${page2.skills.length} rows, hasMore=${page2.hasMore}`)
for (const skill of page2.skills) console.log(`   ${skill.name}`)

const overlap = page1.skills.filter(a => page2.skills.some(b => a.id === b.id))
if (overlap.length > 0) {
  console.error(`FAIL: ${overlap.length} row(s) appear on both pages — pagination is not advancing`)
  process.exit(1)
}
console.log(`\nOK: page 2 is disjoint from page 1 (${overlap.length} overlap)`)
