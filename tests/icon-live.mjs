/** Live smoke: skillhub.cn search rows must carry a host-produced icon data URL. */
import { Market } from '../lib/market.js'

const market = new Market({})
const outcome = await market.search('编程', 5, undefined, 'skillhub', 1)
console.log('rows:', outcome.skills.length)
for (const skill of outcome.skills) {
  const icon = skill.icon
  const ok = typeof icon === 'string' && icon.startsWith('data:image/') && icon.length < 400_000
  console.log(`${skill.name.padEnd(24)} icon=${icon === undefined ? 'ABSENT' : `${ok ? 'OK' : 'BAD'} (${Math.round(icon.length / 1024)}KB, ${icon.slice(5, icon.indexOf(';'))})`}`)
}
const withIcons = outcome.skills.filter(skill => skill.icon !== undefined).length
console.log(withIcons > 0 ? 'ICON SMOKE PASS' : 'ICON SMOKE FAIL (no row carried an icon)')
process.exit(withIcons > 0 ? 0 : 1)
