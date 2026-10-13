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

/** The coordinates of a GitHub-hosted skill, addressed by raw fetch. */
export interface GitHubOrigin {
  kind: 'github'
  owner: string
  repo: string
  /** Branch, tag or commit. */
  ref: string
  /** Repository-relative directory holding SKILL.md, '' for the repo root. */
  dir: string
}

/** The coordinates of a registry-hosted skill, addressed by slug alone. */
export interface SkillHubOrigin {
  kind: 'skillhub'
  slug: string
}

/**
 * Where a skill's files live.
 *
 * Two shapes, because the two sources work fundamentally differently:
 *
 *  - `github` — files live in a repository, addressed by owner/repo/ref/dir and
 *    read through raw.githubusercontent.com. A detail view must first resolve
 *    the skill's directory from a tree listing.
 *  - `skillhub` — the registry hosts the files itself, addressed by slug alone.
 *    No repository, no ref, no accelerator: a detail view reads them straight
 *    from the registry's own file endpoint, which is why this source needs
 *    neither the GitHub budget nor the accelerator chain.
 */
export type MarketOrigin = GitHubOrigin | SkillHubOrigin

/** The licence a skill declares in its own SKILL.md frontmatter. */
export type MarketLicence =
  | { state: 'declared'; licence: string }
  | { state: 'undeclared' }

/** One skill as the market layer serves it to the panel. */
export interface MarketSkill {
  /**
   * Globally unique coordinate.
   *
   * Form depends on the origin kind: `<provider>:<owner>/<repo>@<ref>:<dir>`
   * for GitHub, `skillhub:<slug>` for the registry. It is opaque to the client,
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
  /**
   * The licence the skill declares, when the source reports one.
   *
   * Shown on the row because it is the fact a user needs before deciding to
   * install: an undeclared licence is itself information, and hiding it would
   * make the panel assert a permission nobody granted.
   */
  licence?: MarketLicence
  /**
   * The skill's icon, as a data URL the host itself produced.
   *
   * The registry supplies a third-party URL; the host fetches it under its own
   * URL policy (https, allow-listed hosts, size cap) and re-serves the bytes
   * as a `data:` URL, so the browser never loads an image from an origin the
   * panel did not vet — no referrer leak, no mixed content, no tracking pixel
   * on every panel render. Absent when the source offers none or the fetch
   * failed: a missing icon degrades to the glyph, never to an error.
   */
  icon?: string
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

/** The answer to one page of a source's search. */
export interface SearchPage {
  /** The rows of this page, best match first. */
  rows: MarketSkill[]
  /**
   * Whether the source can serve a page after this one.
   *
   * Deliberately explicit rather than inferred from "the page was full": a
   * registry whose total is unknown cannot answer that question from the row
   * count alone, and a panel that guesses it shows a "load more" control that
   * can only come back empty.
   */
  hasMore: boolean
  /** The registry's own total for this query, when it reports one. */
  total?: number
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
  /** Whether `search` can page past its first answer. */
  readonly pageable: boolean
  /**
   * Search for skills.
   * @param query - free text; empty means "whatever this source lists".
   * @param limit - maximum rows to return for this page.
   * @param ctx - proxy chain and fetchers.
   * @param page - one-based page number; defaults to 1. A source that cannot
   *   page past its first answer ignores this.
   * @returns this page's rows and whether a later page exists.
   */
  search(query: string, limit: number, ctx: MarketSourceContext, page?: number): Promise<SearchPage>
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
