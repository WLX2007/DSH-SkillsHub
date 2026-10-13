/**
 * Real-browser scroll self-test for the panel's height chain.
 *
 * Extracts the compiled CSS from lib/client.js, reproduces the shell's exact
 * center-column chain (grid minmax(0,1fr) → overflow:hidden flex column →
 * the .view mount wrapper → section.page), fills the page with the market
 * card DOM, and asserts in a real engine (Edge):
 *
 *   1. .page is the scroll container (overflow-y auto) with a definite height;
 *   2. the content overflows and scrollTop actually advances;
 *   3. no horizontal overflow from the cards' 8px hover overhang;
 *   4. NEGATIVE CONTROL: with the .view rule removed the page must NOT scroll,
 *      reproducing the shipped bug.
 *
 * Run: node tools/scroll-selftest.mjs
 */
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')
// The compiled CSS lives in the bundle as a single JS string constant.
const cssMatch = bundle.match(/const css = "((?:[^"\\]|\\.)*)";/)
if (cssMatch === undefined) throw new Error('compiled CSS not found in lib/client.js')
const css = JSON.parse(`"${cssMatch[1]}"`)

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('pageerror', err => console.log('[pageerror]', err.message))

const pageHtml = `
  <header class="pageHead"><h1 class="pageTitle">t</h1></header>
  <div class="tabRow"></div>
  <div class="content" role="tabpanel">
    <div class="market">
      <div class="filterBar"></div>
      <ul class="cards">${'<li class="card"><div class="cardHead"><span class="cardIcon">i</span><div class="cardMain"><div class="titleRow"><button class="cardTitle cardId cardOpen">name</button></div><span class="cardDesc">d</span><div class="cardPath"></div></div><div class="cardEnd"><span class="marketInstalls">n</span></div></div></li>'.repeat(40)}</ul>
      <div class="marketTail"><span class="marketTailText">end</span></div>
    </div>
  </div>`

async function measure({ includeViewRule }) {
  const sheet = includeViewRule ? css : css.replace(/\.jbF1yq_view\{[^}]*\}/, '')
  await page.setContent(`<!doctype html><html><body style="margin:0">
<div style="display:grid;grid-template-rows:minmax(0,1fr);height:100vh">
  <div class="centerCol" style="display:flex;flex-direction:column;overflow:hidden;min-width:0">
    <div class="jbF1yq_view" data-dsh-skills-hub-view="">
      <section class="page jbF1yq_page" data-dsh-part="page">${pageHtml}</section>
    </div>
  </div>
</div>`)
  await page.addStyleTag({ content: sheet })
  return page.evaluate(() => {
    const el = document.querySelector('[data-dsh-part="page"]')
    const cs = getComputedStyle(el)
    el.scrollTop = 10_000
    return {
      styleSheetCount: document.styleSheets.length,
      overflowY: cs.overflowY,
      pageHeight: Math.round(el.getBoundingClientRect().height),
      viewport: innerHeight,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      scrollTop: Math.round(el.scrollTop),
      horizontal: el.scrollWidth > el.clientWidth + 1,
    }
  })
}

const withRule = await measure({ includeViewRule: true })
const withoutRule = await measure({ includeViewRule: false })
await browser.close()

console.log('with .view rule   :', JSON.stringify(withRule))
console.log('without .view rule:', JSON.stringify(withoutRule))

const passFixed = withRule.overflowY === 'auto'
  && Math.abs(withRule.pageHeight - withRule.viewport) <= 1
  && withRule.scrollHeight > withRule.clientHeight
  && withRule.scrollTop > 0
  && withRule.horizontal === false
const passNegative = withoutRule.scrollTop === 0 || withoutRule.overflowY !== 'auto'
  ? withoutRule.pageHeight > withoutRule.viewport
  : false

console.log(`scroll works with the fix        : ${passFixed ? 'PASS' : 'FAIL'}`)
console.log(`bug reproduces without .view rule: ${passNegative ? 'PASS (negative control)' : 'FAIL'}`)
process.exit(passFixed && passNegative ? 0 : 1)
