/**
 * The market layer's companion entry (`lib/market.js`).
 *
 * Not part of the plugin surface — the loader imports `main` (lib/index.js)
 * alone. This entry exists so tests can import the market classes directly;
 * see tsdown.config.ts for why the entry cannot be folded into index.js.
 *
 * @module @wulongxi/dsh-skills-hub/market
 */

export { Market } from './registry.ts'
export { installSkill, listInstalled, installName, isSafeRelPath } from './installer.ts'
export type { InstallResult, InstallRoot, InstalledRecord, ProvenanceRecord } from './installer.ts'
