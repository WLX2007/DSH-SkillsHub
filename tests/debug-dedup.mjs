/**
 * Debug the de-duplication with paged search.
 */
import { Market } from '../lib/market.js'

const market = new Market({ builtins: false })
const row = {
  id: 'dup',
  name: 'pdf',
  description: '',
  provider: 'dup',
  sourceLabel: 'anthropics/skills',
  origin: { kind: 'github', owner: 'anthropics', repo: 'skills', ref: 'HEAD', dir: 'skills/pdf' },
}
market.register({ name: 'a', searchable: true, async search() { return { rows: [{ ...row, id: 'a', provider: 'a', installs: 5 }], hasMore: false } }, async detail() { return undefined } })
market.register({ name: 'b', searchable: true, async search() { return { rows: [{ ...row, id: 'b', provider: 'b', installs: 9 }], hasMore: false } }, async detail() { return undefined } })
const outcome = await market.search('pdf', 20)
console.log('skills:', outcome.skills.length)
console.log(JSON.stringify(outcome.skills, null, 1))
