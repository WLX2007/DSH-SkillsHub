/**
 * Pairing trust fence: loopback (the desktop) always passes; a live
 * paired-device cookie is an additional allow path when remote-web-ui is
 * loaded. This plugin never depends on that plugin — without the service the
 * fence stays loopback-only.
 *
 * @module @wulongxi/dsh-skills-hub/pair-access
 */

import type { IncomingMessage } from 'node:http'
import { isLoopbackRequest } from './loopback.ts'

/** Structural pairing lookup (no package dependency on remote-web-ui). */
interface PairingAccess {
  isPairedDevice(request: IncomingMessage): boolean
}

/**
 * Structural host-context shape: the fence reads only the two members it needs
 * so it stays testable without a full cordis Context.
 */
interface LookupCtx {
  get?(name: string, strict?: boolean): unknown
  remoteWebUiPairing?: PairingAccess
}

/**
 * Whether this request may enter the plugin's host routes.
 * @param ctx - host context; may expose remoteWebUiPairing.
 * @param request - the incoming HTTP request.
 * @returns true for loopback, or a live paired-device cookie.
 */
export function isPairedOrLoopbackAllowed(ctx: LookupCtx, request: IncomingMessage): boolean {
  if (isLoopbackRequest(request)) return true
  const fromGet = typeof ctx.get === 'function' ? ctx.get('remoteWebUiPairing', false) : undefined
  const pairing = (isPairingAccess(fromGet) ? fromGet : ctx.remoteWebUiPairing)
  return pairing?.isPairedDevice(request) === true
}

function isPairingAccess(value: unknown): value is PairingAccess {
  return value !== undefined
    && value !== null
    && typeof (value as PairingAccess).isPairedDevice === 'function'
}
