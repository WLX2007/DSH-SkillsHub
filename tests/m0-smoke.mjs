/**
 * M0 smoke test: load both halves the way the host does and assert the
 * contracts the loader depends on.
 *
 * - The client bundle must register itself through
 *   `window.__ModuleLoader__.load({ id, factory })` under the exact package
 *   name, and its factory must resolve `react` / `react/jsx-runtime` through
 *   the INJECTED `require` rather than a global.
 * - The host bundle must export `name`, `inject`, `apply` and `ROUTES`, and
 *   `apply` must register routes on the webserver.
 *
 * Run: node tests/m0-smoke.mjs
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PACKAGE_NAME = '@wulongxi/dsh-skills-hub'

const require = createRequire(join(ROOT, 'package.json'))

let passed = 0
function check(label, fn) {
  try {
    fn()
    passed += 1
    console.log(`  PASS  ${label}`)
  } catch (error) {
    console.error(`  FAIL  ${label}\n        ${error.message}`)
    process.exitCode = 1
  }
}

/** Load the client bundle with a captured loader handoff. */
function loadClientBundle() {
  const source = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
  let handoff
  const windowStub = {
    __ModuleLoader__: {
      load(payload) { handoff = payload },
    },
  }
  // The bundle is a browser script: it reads `window` and expects `document`
  // only when a CSS module's style tag is injected. Provide the minimum.
  const documentStub = {
    documentElement: { lang: 'zh-CN' },
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild() {} },
  }
  const fn = new Function('window', 'document', source)
  fn(windowStub, documentStub)
  assert.ok(handoff, 'bundle did not call window.__ModuleLoader__.load')
  return handoff
}

console.log('client bundle (lib/client.js)')

const handoff = loadClientBundle()

check('registers under the exact package name', () => {
  assert.equal(handoff.id, PACKAGE_NAME)
})

check('exposes a factory function', () => {
  assert.equal(typeof handoff.factory, 'function')
})

const requested = new Set()

/**
 * Stand-in for the official primitives package.
 *
 * The published @deepseek-ai/dsh-client-ui-primitives imports runtime
 * dependencies its manifest never declares (an upstream packaging defect the
 * sibling dsh-web repository patches with packageExtensions), so requiring the
 * real copy fails under plain node. The host supplies the genuine module at
 * runtime from the frozen browser table; this test only needs to prove the
 * bundle asks the loader for it by name, so a recording proxy is enough and
 * avoids pulling shiki/katex/simple-icons into this package's install.
 */
function stubPrimitives() {
  return new Proxy({}, {
    get(_target, prop) {
      // Any named export resolves to a marker component/constant.
      return typeof prop === 'string' ? `primitive:${prop}` : undefined
    },
  })
}

const clientExports = handoff.factory((specifier) => {
  requested.add(specifier)
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return stubPrimitives()
  return require(specifier)
})

check('resolves react through the injected require', () => {
  assert.ok(requested.has('react'), `injected require was asked for: ${[...requested].join(', ')}`)
  assert.ok(requested.has('react/jsx-runtime'))
})

check('reuses the official shared control library', () => {
  // The panel is built on the shipped primitives rather than hand-rolled
  // controls; if this stops being true the UI has drifted off the shell's
  // design system, which is the one thing the official UI package forbids.
  assert.ok(
    requested.has('@deepseek-ai/dsh-client-ui-primitives'),
    'the bundle must resolve the official primitives through the loader',
  )
})

check('requests no module outside the platform table', () => {
  const platform = new Set([
    'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store',
    '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-dockkit',
  ])
  const stray = [...requested].filter(specifier => !platform.has(specifier))
  assert.deepEqual(stray, [], `unanswerable requires: ${stray.join(', ')}`)
})

check('exports the browser plugin contract', () => {
  assert.equal(typeof clientExports.apply, 'function')
  assert.deepEqual(clientExports.inject, ['slots', 'locale', 'layout'])
})

check('injects no settings or theme service it does not use', () => {
  assert.ok(!clientExports.inject.includes('settings'))
})

console.log('\nhost bundle (lib/index.js)')

const host = await import(new URL('../lib/index.js', import.meta.url).href)

check('exports the host plugin contract', () => {
  assert.equal(typeof host.apply, 'function')
  assert.equal(host.name, 'skills-hub')
})

check('declares its required services', () => {
  assert.deepEqual(host.inject, ['webServer', 'skills', 'sessions'])
})

check('declares the local-management and health routes', () => {
  assert.equal(host.ROUTES.health, '/api/skills-hub/health')
  assert.equal(host.ROUTES.list, '/api/skills-hub/list')
  assert.equal(host.ROUTES.setEnabled, '/api/skills-hub/set-enabled')
})

check('every declared route sits under /api/skills-hub', () => {
  for (const [key, path] of Object.entries(host.ROUTES)) {
    assert.ok(path.startsWith('/api/skills-hub/'), `${key} escapes the namespace: ${path}`)
  }
})

check('apply registers the whole route list on the webserver', () => {
  const registered = []
  const ctx = {
    logger: { warn() {} },
    effect(fn) { fn(); return () => {} },
    webServer: { register(route) { registered.push(route); return () => {} } },
  }
  host.apply(ctx)
  const expected = Object.values(host.ROUTES).length
  assert.equal(registered.length, expected, `expected ${expected} routes, got ${registered.length}`)
  assert.ok(registered.some(route => route.path === host.ROUTES.health))
  assert.ok(registered.some(route => route.path === host.ROUTES.list))
  for (const route of registered) assert.equal(route.kind, 'exact')
})

check('apply is a no-op when config disables it', () => {
  const registered = []
  const ctx = {
    logger: { warn() {} },
    effect(fn) { fn(); return () => {} },
    webServer: { register(route) { registered.push(route); return () => {} } },
  }
  host.apply(ctx, { enabled: false })
  assert.equal(registered.length, 0)
})

console.log(`\n${passed} checks passed`)
