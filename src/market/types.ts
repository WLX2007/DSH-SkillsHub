/**
 * The market source contract.
 *
 * A "source" answers one question: given a query, what skills exist online and
 * how do I read one? The panel does not care which registry answered — it gets
 * a normalised `MarketSkill` either way, and each skill carries the exact
 * repository coordinates needed to read its files later.
 *
 * Two sources ship today:
 *
 *  - `skills-sh` — the Agent Skills registry. Search only: it answers
 *    `/api/search` with JSON but serves everything else as an HTML page, so a
 *    skill's detail is resolved from its repository instead.
 *  - `github` — a repository the user names directly (`owner/repo`), enumerated
 *    through the Contents/Trees API. This is what makes any public skills
 *    repository browsable, not only the ones a registry happens to index.
 *
 * @module @wulongxi/dsh-skills-hub/market/types
 */

import type { FetchTextOptions } from './fetch.ts'
import type { ProxyChain } from './proxy.ts'

/** Where a skill's files live, in terms a raw fetch can address. */
export interface MarketOrigin {
  /** Hosting service; only GitHub is supported today. */
  kind: 'github'
  owner: string
  repo: string
  /** Branch, tag or commit. */
  ref: string
  /** Repository-relative directory holding SKILL.md, '' for the repo root. */
  dir: string
}

/** One skill as the market layer serves it to the panel. */
export interface MarketSkill {
  /**
   * Globally unique coordinate.
   *
   * Form: `<provider>:<owner>/<repo>@<ref>:<dir>`. It is opaque to the client,
   * which sends it back verbatim; the host parses it to rebuild the origin
   * rather than trusting any URL the client supplies.
   */
  id: string
  /** Skill name (the `name` in its frontmatter, or the directory name). */
  name: string
  /** One-line description for the result row; may be filled in on detail. */
  description: string
  /** Which source produced this row. */
  provider: string
  /** Human-readable origin, e.g. `anthropics/skills`. */
  sourceLabel: string
  /** Repository coordinates for reading the files. */
  origin: MarketOrigin
  /** Registry-reported install count, when the source publishes one. */
  installs?: number
}

/** One file inside a skill directory. */
export interface MarketFile {
  /** Path relative to the skill directory. */
  path: string
  /** Size in bytes as the API reported it. */
  size: number
}

/** A skill's readable detail. */
export interface MarketDetail {
  skill: MarketSkill
  /** The SKILL.md body (frontmatter stripped). */
  body: string
  /** Frontmatter fields, parsed from the same file. */
  frontmatter: {
    name?: string
    description?: string
    whenToUse?: string
  }
  /** The skill's own files, so the user sees what an install would bring. */
  files: MarketFile[]
  /** Total bytes across those files. */
  totalBytes: number
}

/** What every source receives when it works. */
export interface MarketSourceContext {
  /** Accelerator chain for raw GitHub content. */
  proxy: ProxyChain
  /** Request options carrying the caller's signal. */
  signal?: AbortSignal
  /** Direct JSON/text fetch (no proxy), for API hosts. */
  fetchJson: <T>(url: string, options?: FetchTextOptions) => Promise<T>
  /** Bounded text fetch, routed through the accelerator chain. */
  fetchText: (url: string, options?: FetchTextOptions) => Promise<string>
}

/** One market source. */
export interface MarketSource {
  /** Stable id, used as `MarketSkill.provider` and in the UI filter. */
  readonly name: string
  /** Whether `search` can answer a query. */
  readonly searchable: boolean
  /**
   * Search for skills.
   * @param query - free text; empty means "whatever this source lists".
   * @param limit - maximum rows to return.
   * @param ctx - proxy chain and fetchers.
   * @returns normalised rows, best match first.
   */
  search(query: string, limit: number, ctx: MarketSourceContext): Promise<MarketSkill[]>
  /**
   * Resolve one skill's files and body.
   * @param skill - the row to read, as returned by search or parse.
   * @param ctx - proxy chain and fetchers.
   * @returns the detail, or undefined when the skill has no readable SKILL.md.
   */
  detail(skill: MarketSkill, ctx: MarketSourceContext): Promise<MarketDetail | undefined>
  /**
   * List the skills inside a repository the user named.
   * @param coordinates - `owner/repo`, optionally `owner/repo/sub/dir`.
   * @param ctx - proxy chain and fetchers.
   * @returns normalised rows.
   */
  listRepo?(coordinates: string, ctx: MarketSourceContext): Promise<MarketSkill[]>
}
