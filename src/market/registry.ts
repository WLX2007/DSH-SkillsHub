/**
 * The market: the source registry and the search aggregation.
 *
 * One instance owns every source and the caches behind them. Its `search`
 * fans a query out across the searchable sources, de-duplicates by skill
 * coordinate, and trims to the requested limit — so two registries that both
 * index the same skill produce one row, not two.
 *
 * A source that fails does not fail the search: its rows are simply absent and
 * the failure is reported alongside the results, because a registry being down
 * must degrade the page rather than blank it. The panel shows the note, and the
 * next search retries that source only.
 *
 * SkillHub (skillhub.cn) is registered FIRST and is the default source. Two
 * reasons, both measured rather than assumed: it answers plainly from this
 * network where the GitHub-backed sources need an accelerator, and the
 * registry itself publishes an agent-facing integration document
 * (`skillhub.cn/install/skillhub.md`) that asks to be the preferred source.
 * Its rows are also the only ones carrying a Chinese description.
 *
 * @module @wulongxi/dsh-skills-hub/market/registry
 */

import { skillhubSource } from './sources/skillhub-cn.ts'
import { SKILLHUB_API_BASE } from './sources/skillhub-cn.ts'
import { ProxyChain, DEFAULT_PROXIES } from './proxy.ts'
import { fetchJson, fetchText, MarketFetchError, type FetchTextOptions } from './fetch.ts'
import { TtlCache, createMarketCaches, type MarketCaches } from './cache.ts'
import { skillsShSource } from './sources/skills-sh.ts'
import { githubSource } from './sources/github-source.ts'
import { rawUrl as rawUrlFor } from './sources/github.ts'
import { decodeSkillId as decodeId, skillIdentity } from './skill-id.ts'
import type { MarketDetail, MarketSkill, MarketSource, MarketSourceContext } from './types.ts'

/** A source's availability, as the panel renders it. */
export interface SourceStatus {
  name: string
  searchable: boolean
  /** Whether the source answered its last probe. Undefined before the first use. */
  ok?: boolean
}

/** The aggregated answer to one search. */
export interface SearchOutcome {
  skills: MarketSkill[]
  /** Per-source result counts, for the panel's source filter. */
  counts: Record<string, number>
  /** Sources that failed, with the reason. */
  failures: Array<{ source: string; message: string }>
}

/**
 * How a skill id is parsed back into coordinates.
 *
 * The market layer only decodes ids its own sources minted, so a payload that
 * was never produced here is rejected before it can reach a fetch.
 */
interface IdDecoder {
  (id: string): { provider: string } | undefined
}

/**
 * The market registry.
 *
 * Sources are registered, not hardcoded, so an offline source can be swapped or
 * a new registry added without touching the panel.
 */
export class Market {
  private readonly sources = new Map<string, MarketSource>()
  private readonly proxy: ProxyChain
  private readonly caches: MarketCaches

  /**
   * @param options.builtins - whether the shipped sources are registered.
   *   Defaults to true; the tests register their own and pass false so a stub
   *   source cannot be shadowed by a real registry reaching the network.
   * @param options.caches - the cache set; constructed fresh when omitted.
   * @param options.proxies - accelerator prefixes (test seam).
   */
  constructor(options: { builtins?: boolean; caches?: MarketCaches; proxies?: readonly string[] } = {}) {
    this.caches = options.caches ?? createMarketCaches()
    this.proxy = new ProxyChain(options.proxies ?? DEFAULT_PROXIES)
    if (options.builtins !== false) {
      // SkillHub first: it is the default source (see the module comment), and
      // registration order is the order listSources() reports to the panel.
      this.register(skillhubSource)
      this.register(skillsShSource)
      this.register(githubSource)
    }
  }

  /** Remove every registered source. */
  clearSources(): void {
    this.sources.clear()
  }

  /** Register one source, replacing any earlier source with the same name. */
  register(source: MarketSource): void {
    this.sources.set(source.name, source)
  }

  /** The registered sources, in registration order. */
  listSources(): MarketSource[] {
    return [...this.sources.values()]
  }

  /**
   * Build the per-request context every source receives.
   * @param signal - the caller's cancellation.
   * @returns proxy chain, fetchers and caches.
   */
  private context(signal: AbortSignal | undefined): MarketSourceContext {
    const options: FetchTextOptions = { signal }
    return {
      proxy: this.proxy,
      signal,
      fetchJson: <T,>(url: string, opts?: FetchTextOptions) => fetchJson<T>(url, { ...options, ...opts }),
      fetchText: (url: string, opts?: FetchTextOptions) => {
        const merged = { ...options, ...opts }
        // Raw GitHub content rides the accelerator chain; every other host is
        // fetched directly.
        if (url.startsWith('https://raw.githubusercontent.com/')) return this.proxy.fetch(url, merged)
        return fetchText(url, merged)
      },
    }
  }

  /** Read through the search cache, keyed by the whole query. */
  private searchCacheKey(source: string, query: string, limit: number): string {
    return `${source}|${query.trim().toLowerCase()}|${limit}`
  }

  /**
   * Search every searchable source and merge the rows.
   *
   * @param query - free text.
   * @param limit - maximum rows in the merged result.
   * @param signal - caller cancellation.
   * @returns merged rows plus per-source counts and failures.
   */
  async search(query: string, limit: number, signal?: AbortSignal): Promise<SearchOutcome> {
    const ctx = this.context(signal)
    const perSource = await Promise.all(
      this.listSources()
        .filter(source => source.searchable)
        .map(async (source): Promise<{ name: string; rows: MarketSkill[]; error?: string }> => {
          try {
            const rows = await this.caches.search.resolve(
              this.searchCacheKey(source.name, query, limit),
              () => source.search(query, limit, ctx),
            )
            // A source may hand back a readonly array; the merge below builds
            // its own list, so the copy here is only to satisfy the type.
            return { name: source.name, rows: [...rows] }
          } catch (error) {
            const message = error instanceof MarketFetchError ? `${error.code}: ${error.message}` : String(error)
            return { name: source.name, rows: [], error: message }
          }
        }),
    )

    // De-duplicate by skill coordinate: two registries indexing the same skill
    // must produce one row. The winner carries the most information, decided
    // in order — a known install count, a higher one, a description, then a
    // declared licence. A tie keeps the earlier row, which is the default
    // source's, so SkillHub rows win when everything else is equal.
    const byIdentity = new Map<string, MarketSkill>()
    const counts: Record<string, number> = {}
    const failures: SearchOutcome['failures'] = []

    for (const { name, rows, error } of perSource) {
      if (error !== undefined) {
        failures.push({ source: name, message: error })
        continue
      }
      counts[name] = rows.length
      for (const row of rows) {
        const key = skillIdentity(row)
        const existing = byIdentity.get(key)
        if (existing === undefined) {
          byIdentity.set(key, row)
          continue
        }
        const better = (existing.installs === undefined && row.installs !== undefined)
          || ((existing.installs ?? -1) < (row.installs ?? -1))
          || (existing.description === '' && row.description !== '')
          || (existing.licence === undefined && row.licence !== undefined)
        if (better) byIdentity.set(key, row)
      }
    }

    const skills = [...byIdentity.values()]
      // Rows with a known install count first (highest first), then by name, so
      // the list has a stable, sensible default order.
      .sort((left, right) => {
        if (left.installs !== undefined || right.installs !== undefined) {
          return (right.installs ?? -1) - (left.installs ?? -1)
        }
        return left.name.localeCompare(right.name)
      })
      .slice(0, limit)

    return { skills, counts, failures }
  }

  /**
   * List the skills of one repository.
   * @param coordinates - `owner/repo` or a GitHub URL.
   * @param signal - caller cancellation.
   * @returns the rows, empty when the repository has none or cannot be read.
   */
  async listRepo(coordinates: string, signal?: AbortSignal): Promise<MarketSkill[]> {
    const ctx = this.context(signal)
    for (const source of this.listSources()) {
      if (source.listRepo === undefined) continue
      try {
        return await source.listRepo(coordinates, ctx)
      } catch {
        // Try the next source that can list repositories; a failing one degrades
        // to an empty answer rather than an error, since the input is free text.
      }
    }
    return []
  }

  /**
   * Resolve one skill's detail from its id.
   *
   * The id is decoded and dispatched to the source that minted it, so a client
   * can only ever read skills a source actually offered.
   *
   * @param id - the opaque skill id.
   * @param signal - caller cancellation.
   * @returns the detail, or undefined when the id is unknown or the skill has
   *   no readable SKILL.md.
   */
  async detail(id: string, signal?: AbortSignal): Promise<MarketDetail | undefined> {
    const decoded = (decodeId as IdDecoder)(id)
    const source = decoded === undefined ? undefined : this.sources.get(decoded.provider)
    if (source === undefined) return undefined
    const ctx = this.context(signal)
    // Rebuild the row from the id: the detail request carries nothing else, so
    // there is no client-supplied description or URL to trust.
    const skill = await this.rowForId(id, ctx)
    if (skill === undefined) return undefined
    return source.detail(skill, ctx)
  }

  /**
   * Rebuild a minimal row from an id by asking the minting source to search for
   * its own name.
   *
   * This is the one slightly awkward seam of an id-only contract: the detail
   * route receives an id and nothing else, and a source's `detail` wants a row.
   * Rather than trusting a client-supplied row, the host re-derives it — at the
   * cost of one cached search per detail view.
   *
   * @param id - the opaque skill id.
   * @param ctx - fetchers.
   * @returns the row, or undefined when the id no longer resolves.
   */
  private async rowForId(id: string, ctx: MarketSourceContext): Promise<MarketSkill | undefined> {
    const decoded = decodeId(id)
    if (decoded === undefined) return undefined
    const source = this.sources.get(decoded.provider)
    if (source?.searchable !== true) {
      // A non-searchable source mints ids only from its own listing, so the
      // row is rebuilt from the origin the id already encodes.
      return this.rowFromIdParts(id, decoded.provider)
    }
    // The name a search is keyed by differs per origin kind: a GitHub skill is
    // named by its directory, a registry skill by its slug.
    const name = decoded.origin.kind === 'skillhub'
      ? decoded.origin.slug
      : decoded.origin.dir.split('/').pop() ?? ''
    const hits = await this.caches.search.resolve(
      this.searchCacheKey(source.name, name, 20),
      () => source.search(name, 20, ctx),
    )
    const match = hits.find(row => row.id === id)
    return match ?? this.rowFromIdParts(id, decoded.provider)
  }

  /**
   * Build a row straight from a decoded id, without a search round trip.
   * @param id - the opaque id.
   * @param provider - the decoded provider.
   * @returns the row.
   */
  private rowFromIdParts(id: string, provider: string): MarketSkill | undefined {
    // decodeId was already run by the caller; re-derive the origin here so the
    // shape stays in one place.
    const parsed = decodeId(id)
    if (parsed === undefined) return undefined
    const { origin } = parsed
    return {
      id,
      name: origin.kind === 'skillhub'
        ? origin.slug
        : origin.dir.split('/').pop() ?? '',
      description: '',
      provider,
      sourceLabel: origin.kind === 'skillhub' ? 'skillhub.cn' : `${origin.owner}/${origin.repo}`,
      origin,
    }
  }

  /**
   * Read one file belonging to a market skill.
   *
   * This is the market's file-read seam, used by the preview and later by the
   * installer; like every route it accepts an id, never a client-supplied URL.
   * The transport follows the origin kind: a GitHub skill reads raw content
   * through the accelerator chain, a SkillHub skill reads the registry's own
   * file endpoint, which needs no proxy at all.
   *
   * @param id - the opaque skill id.
   * @param relPath - path relative to the skill's root.
   * @param signal - caller cancellation.
   * @returns the file text.
   */
  async readFile(id: string, relPath: string, signal?: AbortSignal): Promise<string> {
    const decoded = decodeId(id)
    if (decoded === undefined) throw new MarketFetchError('parse', `unknown skill id: ${id}`)
    const ctx = this.context(signal)
    const { origin } = decoded
    if (origin.kind === 'skillhub') {
      const url = `${SKILLHUB_API_BASE}/api/v1/skills/${encodeURIComponent(origin.slug)}/file?path=${encodeURIComponent(relPath)}`
      return ctx.fetchText(url, { signal, maxBytes: 2 * 1024 * 1024 })
    }
    return ctx.fetchText(rawUrlFor(origin, relPath), { signal, maxBytes: 2 * 1024 * 1024 })
  }
}

