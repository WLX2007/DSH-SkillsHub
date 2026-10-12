/**
 * Bounded HTTP for the market layer.
 *
 * Every remote fetch in this plugin goes through here so four properties hold
 * in one place instead of at each call site:
 *
 *  - a hard timeout, so a hung origin cannot stall a panel request;
 *  - a byte cap enforced while reading, so a hostile or broken response cannot
 *    exhaust host memory;
 *  - identity encoding, because the host's fetch loses content decompression
 *    once the bundled undici loads (see src/http.ts);
 *  - an abort signal that composes the caller's cancellation with the timeout.
 *
 * @module @wulongxi/dsh-skills-hub/market/fetch
 */

import { withIdentityEncoding } from '../http.ts'

/** Default per-request timeout. */
export const FETCH_TIMEOUT_MS = 20_000

/** Default response cap: enough for a repository tree, far below a memory risk. */
export const DEFAULT_MAX_BYTES = 4 * 1024 * 1024

/** A fetch failure with a stable code the routes can report. */
export class MarketFetchError extends Error {
  constructor(
    readonly code: 'timeout' | 'network' | 'status' | 'too-large' | 'parse',
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

/** Whether an error is an abort/timeout rather than a transport failure. */
function isAbort(error: unknown): boolean {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined
  return name === 'AbortError' || name === 'TimeoutError'
}

/**
 * Compose the caller's signal with this request's timeout.
 * @param caller - the caller's signal, when it has one.
 * @param timeoutMs - the request's own budget.
 * @returns a signal that aborts on either.
 */
function composeSignal(caller: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  if (caller === undefined) return timeout
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([caller, timeout])
  // Fallback for a runtime without AbortSignal.any: the caller's signal wins
  // when it fires first, which is the behaviour that matters for cancellation.
  return caller.aborted ? caller : timeout
}

/**
 * Read a response body with a hard byte cap.
 *
 * The Content-Length pre-check avoids buffering an announced oversized body;
 * the streaming count then bounds a body that lies about or omits its length.
 *
 * @param response - the response to read.
 * @param maxBytes - the cap.
 * @param what - description used in the error message.
 * @returns the body bytes.
 */
export async function readBodyLimited(response: Response, maxBytes: number, what: string): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new MarketFetchError('too-large', `${what} exceeds ${maxBytes} bytes (content-length: ${declared})`)
  }
  const body = response.body
  if (body === null) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > maxBytes) {
      throw new MarketFetchError('too-large', `${what} exceeds ${maxBytes} bytes (received: ${buffer.byteLength})`)
    }
    return buffer
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new MarketFetchError('too-large', `${what} exceeds ${maxBytes} bytes`)
      chunks.push(value)
    }
  } finally {
    try { await reader.cancel() } catch { /* best effort */ }
  }
  return Buffer.concat(chunks, total)
}

/** Options for one bounded request. */
export interface FetchTextOptions {
  /** Caller cancellation, composed with the timeout. */
  signal?: AbortSignal
  /** Per-request timeout in ms. */
  timeoutMs?: number
  /** Response byte cap. */
  maxBytes?: number
  /** Extra request headers. */
  headers?: Record<string, string>
}

/**
 * Fetch one URL and return its text, bounded and timed out.
 * @param url - absolute URL.
 * @param options - caps, timeout and headers.
 * @returns the response text.
 */
export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const headers = new Headers(options.headers)
  if (!headers.has('user-agent')) headers.set('user-agent', 'dsh-skills-hub')
  if (!headers.has('accept')) headers.set('accept', 'application/json, text/plain;q=0.9, */*;q=0.8')

  let response: Response
  try {
    response = await fetch(url, withIdentityEncoding({
      signal: composeSignal(options.signal, timeoutMs),
      headers,
    }))
  } catch (error) {
    if (isAbort(error)) throw new MarketFetchError('timeout', `request timed out after ${timeoutMs}ms: ${url}`)
    throw new MarketFetchError('network', `request failed: ${url}: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!response.ok) {
    throw new MarketFetchError('status', `${url} answered ${response.status}`, response.status)
  }
  const body = await readBodyLimited(response, maxBytes, url)
  return body.toString('utf8')
}

/**
 * Fetch one URL and parse it as JSON.
 * @param url - absolute URL.
 * @param options - caps, timeout and headers.
 * @returns the parsed JSON value.
 */
export async function fetchJson<T>(url: string, options: FetchTextOptions = {}): Promise<T> {
  const text = await fetchText(url, options)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new MarketFetchError('parse', `${url} did not answer JSON`)
  }
}
