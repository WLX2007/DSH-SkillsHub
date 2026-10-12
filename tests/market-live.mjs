/**
 * Live smoke test for the default source.
 *
 * Deliberately NOT part of the automated suite: it touches the real
 * skillhub.cn. Run by hand when checking the integration is actually up.
 *
 * Run: node tests/market-live.mjs [query]
 */

import { Market } from '../lib/market.js'

const query = process.argv[2] ?? 'pdf'
const market = new Market()

console.log(`searching "${query}" across all sources...\n`)

const outcome = await market.search(query, 10)

console.log('source counts:')
for (const [name, count] of Object.entries(outcome.counts)) {
  console.log(`  ${name.padEnd(12)} ${count}`)
}
for (const failure of outcome.failures) {
  console.log(`  ${failure.source.padEnd(12)} FAILED: ${failure.message.slice(0, 80)}`)
}

console.log(`\nmerged results: ${outcome.skills.length}`)
for (const skill of outcome.skills.slice(0, 10)) {
  const installs = skill.installs !== undefined ? String(skill.installs).padStart(9) : '(none)'
  const licence = skill.licence?.state === 'declared' ? skill.licence.licence : 'undeclared'
  console.log(`  ${installs}  ${skill.name.padEnd(30)} ${skill.provider.padEnd(10)} ${licence}`)
}

// The default source must be present in any non-empty outcome.
const skillhubRows = outcome.skills.filter(skill => skill.provider === 'skillhub')
console.log(`\nskillhub.cn rows: ${skillhubRows.length}`)
if (outcome.skills.length > 0 && skillhubRows.length === 0) {
  console.error('FAIL: skillhub.cn is the default source but contributed nothing')
  process.exit(1)
}

// Resolve one skillhub detail end to end through the real network.
const first = skillhubRows[0]
if (first !== undefined) {
  const detail = await market.detail(first.id)
  if (detail === undefined) {
    console.error(`FAIL: the default source's own row did not resolve (${first.id})`)
    process.exit(1)
  }
  console.log(`\ndetail of "${detail.skill.name}": ${detail.files.length} files, ${detail.totalBytes} bytes`)
  console.log(`  licence: ${detail.skill.licence?.state === 'declared' ? detail.skill.licence.licence : '(undeclared)'}`)
  console.log(`  body: ${detail.body.split('\n')[0].slice(0, 80)}`)
}
