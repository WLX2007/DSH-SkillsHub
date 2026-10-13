/**
 * UI-structure guard.
 *
 * The panel exists to look like a shipped DSH page. Two failure modes are
 * invisible to typecheck and to the host tests, and both shipped once already:
 *
 *  1. Hand-rolled controls. The official UI package states that its primitives
 *     are the one place controls are shared and that copying an existing
 *     control is exactly what must not happen. A `panel.module.css` that styles
 *     its own button/switch/input is that copy.
 *  2. Repeated explanation inside the list. An earlier revision printed the
 *     same "runtime skills cannot be edited" sentence under every card, so the
 *     list read as prose. That text belongs to the group, stated once.
 *
 * This check asserts the structural contract taken from the installed
 * plugin-manager bundle (read out of app.asar, so it describes the running app):
 *
 *   section.group > div.groupHead (h3.groupTitle + span.count) + ul.cards
 *   li.card > div.cardHead > span.cardIcon + div.cardMain + div.cardEnd
 *
 * Run: node tests/ui-structure.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PANEL_DIR = join(ROOT, 'src/client/panel')
const CSS_PATH = join(PANEL_DIR, 'panel.module.css')

let passed = 0
const failures = []
function check(label, fn) {
  try {
    fn()
    passed += 1
    console.log(`  PASS  ${label}`)
  } catch (error) {
    failures.push(label)
    console.error(`  FAIL  ${label}\n        ${error.message}`)
    process.exitCode = 1
  }
}

function read(file) {
  return readFileSync(join(PANEL_DIR, file), 'utf8')
}

/**
 * Strip comments from a source file.
 *
 * The structural assertions below look for code shapes (a control call, a hint
 * helper). Comments legitimately NAME those shapes while explaining why they are
 * absent, so scanning raw text reports a violation for the documentation of the
 * fix itself. Removing comments first keeps the guard about code.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const css = readFileSync(CSS_PATH, 'utf8')

/**
 * The body of one top-level CSS rule, e.g. `cssBlock('.page')`.
 * @param selector - the class selector including its dot.
 * @returns the declaration block, or '' when the rule is absent.
 */
function cssBlock(selector) {
  const match = new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`).exec(css)
  return match?.[1] ?? ''
}
const tabSource = stripComments(read('SkillsTab.tsx'))
const panelSource = stripComments(read('SkillsHubPanel.tsx'))

/** Every panel source file's text (comments stripped), for whole-panel assertions. */
function allPanelSources() {
  return readdirSync(PANEL_DIR)
    .filter(name => /\.tsx?$/.test(name))
    .map(name => ({ name, text: stripComments(read(name)) }))
}

console.log('controls come from the official library')

check('every control import comes from the shared primitives package', () => {
  const offenders = []
  for (const { name, text } of allPanelSources()) {
    for (const m of text.matchAll(/^import\s+(?!type\b)[^'\n]*from\s+'([^']+)'/gm)) {
      const specifier = m[1]
      const allowed = specifier === 'react' || specifier === '@deepseek-ai/dsh-client-ui-primitives'
        || specifier.startsWith('./') || specifier.startsWith('../')
      if (!allowed) offenders.push(`${name}: ${specifier}`)
    }
  }
  if (offenders.length > 0) throw new Error(`non-primitive value imports: ${offenders.join('; ')}`)
})

check('the panel uses the official Switch rather than a drawn toggle', () => {
  if (!tabSource.includes('<Switch')) throw new Error('SkillsTab does not render the official Switch')
  // A hand-rolled toggle would need a track and a thumb.
  if (/\.switchTrack|\.switchThumb|\.switch\b/.test(css)) {
    throw new Error('panel.module.css draws its own switch track/thumb')
  }
})

check('the panel uses the official Modal rather than window.confirm', () => {
  if (/window\.confirm/.test(tabSource)) throw new Error('SkillsTab calls window.confirm')
  if (!tabSource.includes('<Modal')) throw new Error('SkillsTab does not render the official Modal')
})

console.log('\nskill preview uses the shell renderer')

const previewSource = stripComments(read('SkillPreview.tsx'))

check('preview renders skill text through the official MarkdownText', () => {
  if (!previewSource.includes('MarkdownText')) {
    throw new Error('the preview does not use the shell markdown renderer')
  }
  // A hand-rolled renderer would need to produce HTML, which is exactly what
  // the primitive refuses to do for untrusted text.
  if (/dangerouslySetInnerHTML/.test(previewSource)) {
    throw new Error('the preview injects HTML instead of rendering untrusted markdown')
  }
})

check('preview opens in the official Modal, not a bespoke overlay', () => {
  if (!previewSource.includes('Modal')) throw new Error('the preview is not a Modal')
  if (/createPortal|position:\s*fixed/.test(previewSource)) {
    throw new Error('the preview draws its own overlay')
  }
})

check('preview asks for the skill by name so pathless skills resolve', () => {
  // Sending a path would make runtime-registered and bundled skills
  // unpreviewable — they have no file, and those are the ones worth reading.
  if (!/api\.preview\(\s*skill\.name/.test(previewSource)) {
    throw new Error('the preview must request the skill by name')
  }
})

check('preview keeps its markdown labels referentially stable', () => {
  // A new label identity per render discards the renderer's parse cache.
  if (!/useMemo\(/.test(previewSource)) {
    throw new Error('markdown labels are rebuilt every render')
  }
})

check('the card title is the preview trigger', () => {
  if (!tabSource.includes('css.cardOpen')) throw new Error('the card title is not a button')
  if (!/setPreviewing\(true\)/.test(tabSource)) throw new Error('nothing opens the preview')
  if (!tabSource.includes('SkillPreviewDialog')) throw new Error('the preview dialog is not mounted by the card')
})

console.log('\nthe market page reuses the list and the renderer')

const marketSource = stripComments(read('MarketTab.tsx'))

check('market results use the shipped card anatomy', () => {
  for (const cls of ['card', 'cardHead', 'cardIcon', 'cardMain', 'titleRow', 'cardDesc', 'cardEnd']) {
    if (!marketSource.includes(`css.${cls}`)) throw new Error(`market card is missing .${cls}`)
  }
  // A bespoke row shape here would fork the list's look from the skills tab.
  if (/css\.row\b/.test(marketSource)) {
    throw new Error('market rows use the old row shape instead of cards')
  }
})

check('market detail renders through the shell markdown renderer', () => {
  if (!marketSource.includes('MarkdownText')) throw new Error('the market detail is not rendered by MarkdownText')
  if (!marketSource.includes('Modal')) throw new Error('the market detail is not a Modal')
  if (/dangerouslySetInnerHTML/.test(marketSource)) throw new Error('the market detail injects HTML')
})

check('market markdown labels stay referentially stable', () => {
  if (!/useMemo\(/.test(marketSource)) throw new Error('market labels are rebuilt every render')
})

check('the market offers no install action before the installer exists', () => {
  // The next milestone adds installation; until its route exists, the tab must
  // not render a control that can only fail. The pattern is deliberately
  // narrow: an install-count badge (`marketInstalls`, a registry statistic)
  // is legitimate and must not trip it, so only an install *action* matches —
  // a button or a handler named install.
  if (/onInstall|installSkill|action\.install|'market\.install\b|安装到/.test(marketSource)) {
    throw new Error('the market tab offers an install action before M3 exists')
  }
})

console.log('\nthe scroll height chain stays intact')

// The slot anchor renders with display:contents (verified in the installed
// renderer bundle), so .page is a direct flex child of the shell's center
// column — an overflow:hidden grid row of minmax(0,1fr) with a definite
// height. The shipped plugin-manager page scrolls ITSELF (.page: height:100%;
// overflow:auto), and this panel does the same. Shipping the wrong model — a
// clipped .page with an inner scroll surface, or a page with no definite
// height — shows up as a list that cannot scroll at all, which is how the
// market tab shipped twice, so the chain is pinned rule by rule.
check('.page is the scroll surface with a definite height', () => {
  const page = cssBlock('.page')
  if (!/height:\s*100%/.test(page)) throw new Error('.page must fill the center column height')
  if (!/overflow:\s*auto/.test(page) && !/overflow-y:\s*auto/.test(page)) {
    throw new Error('.page must scroll itself, as the shipped plugin-manager page does')
  }
  if (/overflow:\s*hidden/.test(page) && !/overflow-x:\s*hidden/.test(page)) {
    throw new Error('.page must not be overflow:hidden — that clips the list with no scrollbar')
  }
})

check('the page does not force full width onto its children', () => {
  // The shipped page centers content-sized children; a forced width:100%
  // fights the cards' 8px hover overhang and surfaces as a horizontal
  // scrollbar (shipped once, on the skills tab).
  if (/\.page>\*\{[^}]*width:\s*100%/.test(css.replace(/\s/g, ''))) {
    throw new Error('.page > * must not force width:100% (the shipped page has no such rule)')
  }
})

console.log('\nthe list keeps the shipped page structure')

check('cards are a ul.cards list of li.card rows', () => {
  if (!/<ul className=\{css\.cards\}>/.test(tabSource)) throw new Error('no ul.cards wrapper')
  if (!/<li\s/.test(tabSource)) throw new Error('cards are not list items')
})

check('each card has the shipped head/cardMain/cardEnd anatomy', () => {
  for (const cls of ['cardHead', 'cardIcon', 'cardMain', 'titleRow', 'cardDesc', 'cardEnd']) {
    if (!tabSource.includes(`css.${cls}`)) throw new Error(`card is missing .${cls}`)
  }
})

check('groups are headed by a title plus a count, not a bare heading', () => {
  if (!tabSource.includes('css.groupHead')) throw new Error('no groupHead row')
  if (!tabSource.includes('css.count')) throw new Error('no count element beside the group title')
})

check('the group explanation is rendered once per group, outside the cards', () => {
  const groupHintUses = (tabSource.match(/css\.groupHint/g) ?? []).length
  if (groupHintUses !== 1) {
    throw new Error(`css.groupHint is rendered ${groupHintUses} times; it belongs once per group`)
  }
  // It must not be inside the card component.
  const cardStart = tabSource.indexOf('function SkillCard')
  const cardEnd = tabSource.indexOf('function WorkspaceFilter')
  const cardBody = tabSource.slice(cardStart, cardEnd)
  if (cardBody.includes('groupHint')) throw new Error('the group hint leaks into every card')
})

check('no per-card explanation paragraph is printed for a pathless skill', () => {
  // The earlier defect: a hint sentence under every pathless row.
  if (/localFileHint|noFileHint|providerFileHint/.test(tabSource)) {
    throw new Error('a per-row hint helper is back; that text belongs to the group')
  }
})

check('trailing toolbar actions are pushed to the column edge', () => {
  // The search field is width-bounded, so without a flexible spacer the
  // trailing actions sit right beside it — stranded mid-column with a large
  // empty gap to their right.
  if (!tabSource.includes('css.filterSpacer')) {
    throw new Error('the filter bar has no spacer; trailing actions will sit beside the search box')
  }
  if (!/\.filterSpacer\s*\{[^}]*flex:\s*1/.test(css)) {
    throw new Error('.filterSpacer must be flexible, or it cannot absorb the slack')
  }
  // The spacer has to come after the filters and before the trailing action.
  const spacerAt = tabSource.indexOf('css.filterSpacer')
  const refreshAt = tabSource.indexOf('aria-label={tt(\'action.refresh\')}')
  if (!(spacerAt < refreshAt)) {
    throw new Error('the spacer must precede the trailing action in the filter bar')
  }
})

check('the page lays its content out in the shipped centred column', () => {
  for (const cls of ['page', 'pageHead', 'pageTitle', 'pageIntro']) {
    if (!panelSource.includes(`css.${cls}`)) throw new Error(`panel shell is missing .${cls}`)
  }
  // The 960px column and its 20px title are the shipped page geometry.
  if (!/max-width:\s*960px/.test(css)) throw new Error('the page lost its 960px column')
  if (!/font-size:\s*20px/.test(css)) throw new Error('the page title lost its 20px size')
})

check('a card does not stack more than one description line', () => {
  // One clamped line keeps the row one row tall, as the shipped cards do.
  if (!/-webkit-line-clamp:\s*1/.test(css)) throw new Error('card description is no longer clamped to one line')
})

console.log(`\n${passed} checks passed${failures.length > 0 ? `, ${failures.length} failed` : ''}`)
