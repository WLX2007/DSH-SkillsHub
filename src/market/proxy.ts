/**
 * GitHub accelerator chain.
 *
 * Measured constraint: the unauthenticated GitHub API allows 60 requests per
 * hour per IP, and raw.githubusercontent.com plus api.github.com are frequently
 * unreachable from mainland China. So every GitHub read goes through a chain of
 * candidate prefixes, tried in order until one answers.
 *
 * The chain is a *degradation* list, never a single hardcoded host: public
 * mirrors appear and disappear constantly (of the eight probed while building
 * this, two were already dead). The first success is remembered for the process
 * lifetime, so the common case costs no extra requests.
 *
 * Only the RAW host benefits from a proxy prefix. The API host is deliberately
 * left direct: mirror operators generally do not pass API traffic, and a wrong
 * guess there would waste a request from the scarce 60/hour budget.
 *
 * @module @wulongxi/dsh-skills-hub/market/proxy
 */

import { fetchText, type FetchTextOptions } from './fetch.ts'

/**
 * Default accelerator prefixes, probed 2026-10-12 with a raw SKILL.md fetch.
 *
 * The empty string first means "try GitHub directly" — on a machine that can
 * reach it (or one with its own proxy) no third party is involved at all, which
 * is both faster and better for privacy.
 */
export const DEFAULT_PROXIES: readonly string[] = [
  '',
  'https://gh-proxy.com/',
  'https://ghproxy.icu/',
  'https://ghfast.top/',
  'https://github.tbap.top/',
  'https://gh.dpik.top/',
]

/** The raw content host a prefix is applied to. */
const RAW_HOST = 'https://raw.githubusercontent.com/'

/**
 * Whether a URL is one a proxy prefix can accelerate.
 * @param url - candidate URL.
 * @returns whether this is a raw content URL.
 */
export function isProxyable(url: string): boolean {
  return url.startsWith(RAW_HOST)
}

/**
 * Apply one prefix to a URL.
 * @param url - the direct URL.
 * @param prefix - an accelerator prefix, or '' for direct.
 * @returns the URL to request.
 */
export function applyProxy(url: string, prefix: string): string {
  return prefix === '' ? url : prefix + url
}

/**
 * The GitHub accelerator chain for one plugin instance.
 *
 * It holds the last prefix that worked so a session settles on one mirror after
 * the first success, and it never promotes a prefix that has not answered.
 */
export class ProxyChain {
  private known: string | undefined

  /**
   * @param prefixes - candidate prefixes in preference order.
   * @param fetchImpl - request implementation (test seam).
   */
  constructor(
    private readonly prefixes: readonly string[] = DEFAULT_PROXIES,
    private readonly fetchImpl: typeof fetchText = fetchText,
  ) {}

  /** The prefixes this chain will try, in order, starting from the known-good one. */
  candidates(): string[] {
    if (this.known === undefined) return [...this.prefixes]
    // Known-good first, then the rest so a mirror that dies mid-session can
    // still fall through.
    return [this.known, ...this.prefixes.filter(prefix => prefix !== this.known)]
  }

  /** The prefix that last succeeded, or undefined when nothing has yet. */
  get settled(): string | undefined {
    return this.known
  }

  /** Forget the remembered mirror, so the next call re-probes from the top. */
  reset(): void {
    this.known = undefined
  }

  /**
   * Fetch a URL through the chain.
   *
   * A non-raw URL is fetched directly: there is nothing for a prefix to
   * accelerate, and routing the scarce API budget through a third party would
   * be both slower and less private.
   *
   * @param url - the direct URL.
   * @param options - caps, timeout and headers.
   * @returns the response text.
   * @throws the last attempt's error when every candidate fails.
   */
  async fetch(url: string, options: FetchTextOptions = {}): Promise<string> {
    if (!isProxyable(url)) return this.fetchImpl(url, options)

    let lastError: unknown
    for (const prefix of this.candidates()) {
      try {
        const text = await this.fetchImpl(applyProxy(url, prefix), options)
        this.known = prefix
        return text
      } catch (error) {
        lastError = error
        // A caller-driven abort must stop the chain: retrying the remaining
        // mirrors would ignore the cancellation that asked us to stop.
        if (options.signal?.aborted === true) throw error
      }
    }
    throw lastError ?? new Error(`no accelerator could fetch ${url}`)
  }
}
