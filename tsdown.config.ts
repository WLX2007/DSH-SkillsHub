/**
 * Standalone tsdown config for the skills-hub plugin.
 *
 * This package lives outside the dsh-web monorepo, so the shared client-bundle
 * preset (`shared/tsdown.client.ts`) is not importable here. The three pieces
 * that preset actually owns are restated below, reduced to what this plugin
 * needs:
 *
 *  1. externals = the shell's frozen browser module table, so `react` and the
 *     published platform modules resolve through the loader's injected
 *     `require` instead of being bundled twice;
 *  2. a CSS-Modules resolver that compiles `*.module.css` with lightningcss and
 *     auto-injects one `<style data-plugin>` tag per module file, exporting the
 *     hashed class map;
 *  3. the closure-factory banner/footer for `window.__ModuleLoader__.load`.
 *
 * The client bundle lands at `lib/client.js` next to the node half, which the
 * host's client-modules serves at `/plugins/<package name>/client.js` because
 * `package.json#exports["./client"]` points there.
 *
 * @module @wulongxi/dsh-skills-hub/tsdown
 */
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

/** The plugin id stamped into the loader handoff and the injected style tags. */
const PLUGIN_ID = '@wulongxi/dsh-skills-hub'

/**
 * The shell's frozen browser module table. These stay external: the loader's
 * injected `require` answers them from the shared table, and bundling a second
 * copy would create a distinct React instance and a second slot registry.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is the official shared control
 * library (Button / Switch / Input / Tag / PathLabel / SegmentedControl and the
 * product icon set). It is in the table, so this plugin REUSES the shipped
 * controls rather than re-implementing them: the official package states that
 * copying an existing control is precisely what must not happen, and that this
 * package is the one place controls are shared between plugins. The official
 * theme bundle resolves it through the same injected `require`.
 */
const PLATFORM_MODULES: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline
 * (which requires @tsdown/css). The suffix matters: tsdown's guard matches ids
 * ending in `.css`, so the virtual id must not.
 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Repository root, used to keep emitted region comments machine-independent. */
const REPOSITORY_ROOT = fileURLToPath(new URL('.', import.meta.url))

/** Rebase a physical path onto a repository-relative id when it lives under the repo. */
function repositoryRelativePath(physical: string): string {
  if (!isAbsolute(physical)) return physical
  const repositoryPath = relative(REPOSITORY_ROOT, physical).split('\\').join('/')
  return repositoryPath.startsWith('../') ? physical : repositoryPath
}

/** Resolve an emitted JS asset import against its source-tree counterpart. */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = '\\lib\\types\\'
  const boundary = emitted.indexOf(marker)
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
}

/** The building package's version, baked in for diagnostics. */
function buildPackageVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(resolvePath(process.cwd(), 'package.json'), 'utf8'))
    return typeof manifest.version === 'string' ? manifest.version : ''
  } catch {
    return ''
  }
}

/** Node-half library config (the host plugin entry). */
function hostLibraryConfig(): UserConfig {
  return {
    name: `${PLUGIN_ID}/host`,
    // `lib/market.js` is a companion entry, not part of the plugin surface:
    // the loader imports `main` (lib/index.js) alone. It exists because the
    // market classes are exercised by tests that import the built artifacts,
    // and tsdown folds a re-exported binding into the single local binding its
    // internal consumer already holds — `export { Market }` from index.ts was
    // dropped twice, and a `const SkillsHubMarket = Market` bridge then
    // referenced the bundle's renamed local (`Market$1`) and crashed at import.
    // Emitting the module under its own entry sidesteps the folding entirely:
    // each entry keeps its own bindings. The object form fixes the file name,
    // which a path entry would derive as a content-hashed chunk name.
    entry: { index: 'src/index.ts', market: 'src/market/registry.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    // clean must stay off: the client pass emits into the same lib/ directory.
    clean: false,
    // cordis resolves at runtime from the dsh profile tree; its published
    // declarations carry .ts-suffixed relative imports rolldown cannot follow.
    external: ['@deepseek-ai/cordis'],
  }
}

/** Browser-half bundle config (the GUI plugin entry). */
function clientBundleConfig(): UserConfig {
  return {
    name: `${PLUGIN_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...PLATFORM_MODULES],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
      __DSH_PKG_VERSION__: JSON.stringify(buildPackageVersion()),
    },
    // Anything the loader table cannot answer must be inlined instead of left
    // as a require: a bare require() the frozen table does not know throws at
    // boot, so the table list is the rule.
    noExternal: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
    plugins: [
      {
        // Bundle purity gate: a value import of an @deepseek-ai package that is
        // neither a platform table entry nor this package's own code would
        // either duplicate a runtime instance or emit an unanswerable require.
        // Catching it at build time beats a blank panel at runtime.
        name: 'dsh-client-bundle-purity',
        resolveId(source: string) {
          if (!source.startsWith('@deepseek-ai/')) return null
          if (PLATFORM_MODULES.includes(source)) return null
          throw new Error(
            `client bundle purity: "${source}" is not a platform module (${PLATFORM_MODULES.join(', ')}) — `
            + 'cross-plugin value imports are forbidden; collaborate through cordis services instead '
            + '(type-only imports are erased and never reach this gate)',
          )
        },
      },
      {
        name: 'dsh-css-modules-inline',
        resolveId(source: string, importer: string | undefined) {
          if (!source.endsWith('.module.css')) return null
          const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
          return CSS_VIRTUAL_PREFIX + repositoryRelativePath(abs) + CSS_VIRTUAL_SUFFIX
        },
        async load(virtualId: string) {
          if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
          const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
          const physical = isAbsolute(fileId) ? fileId : resolvePath(REPOSITORY_ROOT, fileId)
          this.addWatchFile(physical)
          const source = await readFile(physical)
          const { code, exports: cssExports } = transform({
            filename: fileId,
            code: source,
            cssModules: { pattern: '[hash]_[local]' },
            minify: true,
          })
          const classMap: Record<string, string> = {}
          // Sorted: lightningcss's export iteration order is process-dependent,
          // which would otherwise churn lib/client.js on every rebuild.
          for (const [local, exp] of Object.entries(cssExports ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
            classMap[local] = exp.name
          }
          return [
            `const css = ${JSON.stringify(code.toString())};`,
            `const tagId = ${JSON.stringify(`${PLUGIN_ID}/${fileId}`)};`,
            'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
            '  const tag = document.createElement(\'style\');',
            `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
            '  tag.dataset.pluginCss = tagId;',
            '  tag.textContent = css;',
            '  document.head.appendChild(tag);',
            '}',
            `export default ${JSON.stringify(classMap)};`,
          ].join('\n')
        },
      },
    ],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}

export default [hostLibraryConfig(), clientBundleConfig()]
