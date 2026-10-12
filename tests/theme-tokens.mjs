/**
 * Theme-token guard.
 *
 * An undefined CSS custom property makes `var(--x)` resolve to nothing, so the
 * whole declaration is dropped and the rule silently does nothing. A typo in a
 * token name therefore produces an invisible style bug rather than an error —
 * exactly the class of failure a build should catch. This was a real defect in
 * the M0 stylesheet: three invented names (--dsw-alias-bg-primary,
 * --dsw-alias-border-secondary, --dsw-font-family-base) silently removed the
 * panel's background, borders and font.
 *
 * Ground truth is the shipped application itself. The GUI's theme stylesheet
 * lives inside `app.asar`, which is a plain archive whose members are stored
 * verbatim — so the archive is scanned as one byte blob. The installed profile
 * CSS/JS is scanned too, because plugin bundles declare and use family tokens
 * that the application archive may not carry.
 *
 * Allowlisted prefixes are local, package-owned properties (declared here or by
 * the shell for this plugin), not theme tokens.
 *
 * Run: node tests/theme-tokens.mjs
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The shipped application archive: the authoritative theme token source. */
const ASAR = 'D:/Soft/Other/DeepSeek Harness/resources/app.asar'

/** Shipped plugin trees, whose bundles declare and use family tokens. */
const SHIPPED_ROOTS = [
  'C:/Users/WLX/.dsh/profiles/desktop/node_modules',
]

/**
 * Prefixes that are NOT theme tokens: local properties this package or the
 * shell defines for this plugin's own scoping.
 */
const LOCAL_PREFIXES = [
  '--dsh-css-',
  '--skills-hub-',
]

/**
 * Recursively collect files under a root.
 *
 * Nested node_modules directories hold the pnpm store layout
 * (`.pnpm/<pkg>/node_modules/<pkg>`), so they must be traversed.
 */
function walk(root, filter, out = [], depth = 0) {
  if (depth > 14 || out.length > 30000) return out
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      walk(full, filter, out, depth + 1)
    } else if (entry.isFile() && filter(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** Harvest token names from the shipped trees plus the application archive. */
function shippedTokens() {
  const tokens = new Set()
  const files = []
  for (const root of SHIPPED_ROOTS) {
    if (!existsSync(root)) continue
    files.push(...walk(root, name => name.endsWith('.css')))
    files.push(...walk(root, name => /\.(js|mjs)$/.test(name)))
  }
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const match of text.matchAll(/--dsw-[a-z0-9-]+|--ds-[a-z0-9-]+/g)) {
      tokens.add(match[0])
    }
  }
  // The application archive is stored verbatim, so its members are scannable as
  // one latin1 blob. This is where the real theme stylesheet lives.
  if (existsSync(ASAR)) {
    try {
      const blob = readFileSync(ASAR).toString('latin1')
      for (const match of blob.matchAll(/--dsw-[a-z0-9-]+|--ds-[a-z0-9-]+/g)) {
        tokens.add(match[0])
      }
    } catch {
      // A locked or partially written archive must fail loudly, not silently
      // shrink the ground truth: an empty set would flag every real token.
      throw new Error(`cannot read the shipped archive at ${ASAR}; run this check with the app closed or adjust ASAR`)
    }
  }
  return tokens
}

/** Collect the tokens this package's own sources reference. */
function ownTokens() {
  const used = new Map()
  const files = [
    ...walk(join(ROOT, 'src'), name => name.endsWith('.css')),
    ...walk(join(ROOT, 'src'), name => name.endsWith('.ts') || name.endsWith('.tsx')),
  ]
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
      const token = match[1]
      if (!used.has(token)) used.set(token, [])
      used.get(token).push(file.replace(ROOT, '').replace(/\\/g, '/'))
    }
  }
  return used
}

const shipped = shippedTokens()
const own = ownTokens()

console.log(`shipped token names harvested: ${shipped.size}`)
console.log(`tokens referenced by this package: ${own.size}\n`)

const unknown = []
for (const [token, files] of own) {
  if (shipped.has(token)) continue
  if (LOCAL_PREFIXES.some(prefix => token.startsWith(prefix))) continue
  unknown.push({ token, files: [...new Set(files)] })
}

if (unknown.length > 0) {
  console.error('Unknown theme tokens (an undefined var() drops its declaration silently):')
  for (const { token, files } of unknown) {
    console.error(`  ${token}`)
    for (const file of files) console.error(`      ${file}`)
  }
  console.error('\nFix: use a token the shipped SDK defines, or declare the property yourself.')
  process.exitCode = 1
} else {
  console.log('PASS  every referenced token is defined by the shipped SDK')
}

// Report the theme tokens this package uses, so the set stays reviewable.
console.log('\nTokens in use:')
for (const token of [...own.keys()].sort()) {
  console.log(`  ${token}`)
}
