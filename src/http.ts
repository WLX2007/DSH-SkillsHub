/**
 * Shared JSON body/response helpers for the host route family: one lenient
 * bounded body reader, one JSON writer, and the outbound request-init helper
 * that keeps a host fetch body decodable.
 *
 * @module @wulongxi/dsh-skills-hub/http
 */

import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http'

/** Default body cap for readJsonBody: 64 KiB. */
const DEFAULT_JSON_BODY_MAX_BYTES = 64 * 1024

/** Family-default JSON response headers; callers may append or override. */
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
} satisfies OutgoingHttpHeaders

/**
 * Lenient bounded body reader: parse a request body as JSON, or null on an
 * empty body, invalid JSON, or a body past maxBytes (default 64 KiB).
 * Overflow destroys the request instead of draining the remainder; callers
 * must not keep reading the request afterwards. With objectOnly, non-object
 * payloads also yield null.
 *
 * @param req - the incoming request.
 * @param opts - cap and object narrowing.
 * @returns the parsed body, or null when it is absent/invalid/oversized.
 */
export async function readJsonBody(
  req: IncomingMessage,
  opts: { maxBytes?: number; objectOnly?: boolean } = {},
): Promise<unknown | null> {
  const maxBytes = opts.maxBytes ?? DEFAULT_JSON_BODY_MAX_BYTES
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > maxBytes) {
      req.destroy()
      return null
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return null
  try {
    const parsed: unknown = JSON.parse(text)
    if (opts.objectOnly && !isJsonObject(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** Whether a value is a JSON object: typeof object, not null, not an array. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Request init that asks a remote origin for an uncompressed body.
 *
 * The DSH host boots a proxy layer whose top-level import of the npm `undici`
 * copy replaces the dispatcher Node's built-in fetch reads; that wrapper drops
 * content-encoding handling, so a plain fetch of a compressed body resolves to
 * raw gzip bytes no JSON consumer can read. Every host fetch that parses a
 * remote body must therefore request identity encoding.
 *
 * @param init - the caller's request init (signal, headers, method, ...).
 * @returns a copy with `accept-encoding: identity` merged in.
 */
export function withIdentityEncoding(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('accept-encoding', 'identity')
  return { ...init, headers }
}

/**
 * Write one JSON response.
 * @param res - the response to write.
 * @param status - HTTP status code.
 * @param body - JSON-serializable payload.
 * @param headers - extra or overriding headers.
 */
export function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: OutgoingHttpHeaders = {},
): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { ...JSON_HEADERS, ...headers })
  res.end(payload)
}
