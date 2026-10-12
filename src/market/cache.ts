/**
 * A small TTL cache for market lookups.
 *
 * This exists because of a measured constraint, not for speed: the
 * unauthenticated GitHub API allows **60 requests per hour**, and resolving one
 * skill's file layout costs one tree request. Without caching, a handful of
 * searches exhausts the budget and the panel breaks for the rest of the hour.
 *
 * Search hits and repository trees are cached for their own lifetimes, and the
 * timestamps are refreshed only on a successful fetch, so a failed request
 * never pins an empty result in place.
 *
 * @module @wulongxi/dsh-skills-hub/market/cache
 */

/** One cached entry. */
interface Entry<T> {
  value: T
  /** Epoch ms after which the entry is stale. */
  expiresAt: number
}

/** A TTL cache with a bounded entry count. */
export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>()

  /**
   * @param ttlMs - how long a value stays fresh.
   * @param maxEntries - eviction bound; the oldest insert is dropped past it.
   */
  constructor(private readonly ttlMs: number, private readonly maxEntries = 200) {}

  /** Read a fresh value, or undefined when absent or stale. */
  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt <= now) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  /** Store a value for this key. */
  set(key: string, value: T, now = Date.now()): void {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      // Map preserves insertion order, so the first key is the oldest insert.
      const oldest = this.entries.keys().next()
      if (oldest.done !== true) this.entries.delete(oldest.value)
    }
    this.entries.set(key, { value, expiresAt: now + this.ttlMs })
  }

  /** Number of entries currently held (fresh and stale). */
  get size(): number {
    return this.entries.size
  }

  /** Drop everything. */
  clear(): void {
    this.entries.clear()
  }

  /**
   * Read through the cache: a fresh hit returns immediately, otherwise `load`
   * runs and its result is stored. A throwing `load` stores nothing, so a
   * transient failure is retried by the next caller instead of being cached.
   *
   * @param key - cache key.
   * @param load - the loader to run on a miss.
   * @returns the fresh or freshly loaded value.
   */
  async resolve(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.get(key)
    if (hit !== undefined) return hit
    const value = await load()
    this.set(key, value)
    return value
  }
}

/** One shared cache set for the market layer. */
export interface MarketCaches {
  /**
   * One source's paged search answer, keyed by source+query+limit+page.
   *
   * The whole `SearchPage` is cached rather than just its rows, because "load
   * more" must not be answered with page one from the cache and `hasMore` is
   * part of the answer.
   */
  search: TtlCache<import('./types.ts').SearchPage>
  /** GitHub repository trees, keyed by owner/repo@ref. */
  tree: TtlCache<readonly import('./sources/github.ts').TreeEntry[]>
  /** Remote file bodies (SKILL.md), keyed by raw URL. */
  file: TtlCache<string>
}

/**
 * Build the cache set with lifetimes matched to how fast each source changes.
 * @returns the cache set.
 */
export function createMarketCaches(): MarketCaches {
  return {
    // A registry's ranking drifts, but not second to second.
    search: new TtlCache(5 * 60_000, 100),
    // A repository's file layout changes only on a push: the long lifetime is
    // what keeps the 60/hour API budget usable.
    tree: new TtlCache(30 * 60_000, 40),
    // A published skill body is effectively immutable at a given ref.
    file: new TtlCache(30 * 60_000, 200),
  }
}
