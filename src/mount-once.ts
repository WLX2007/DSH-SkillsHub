/**
 * Host single-instance guard. A profile can carry both the aggregate bundle row
 * and a standalone install of the same package; without this guard the second
 * instance would re-register the same webserver routes and fail the boot.
 *
 * A refused mount is QUEUED rather than dropped: the Host creates new loader
 * entries before tearing down the old ones (a plugin-manager write, a settings
 * reload, HMR), so dropping the refused mount loses the plugin for good once
 * the previous holder disposes. The queue replays the moment the name is
 * released, if the waiting fiber is still alive.
 *
 * The registry rides a global symbol so two module instances of the same
 * package (npm copy vs repository link) still share one verdict.
 *
 * @module @wulongxi/dsh-skills-hub/mount-once
 */

/** Process-wide contract: package names currently mounted. */
const MOUNTED = Symbol.for('dsh-web.mounted-plugins')

/** Additive key this guard owns: refused mounts waiting for the name. */
const WAITERS = Symbol.for('dsh-web.mounted-plugins.waiters')

/** The slice of a cordis context this guard touches. */
interface MountContext {
  effect?: (effect: () => unknown) => unknown
}

/** One mount that was refused while another fiber owned the package name. */
interface PendingMount {
  /** Replay the refused mount; a no-op once its own fiber has been disposed. */
  run(): void
}

interface MountRegistry {
  [MOUNTED]?: unknown
  [WAITERS]?: Map<string, PendingMount[]>
}

/**
 * The shared name registry, always a `Set` whatever another build stored here:
 * a foreign value must not take the plugin down with it.
 * @returns the process-wide set of mounted package names.
 */
function mountedSet(): Set<string> {
  const registry = globalThis as MountRegistry
  const existing = registry[MOUNTED]
  if (existing instanceof Set) return existing as Set<string>
  const created = new Set<string>()
  registry[MOUNTED] = created
  return created
}

/** Queue per package name for mounts refused while a holder was alive. */
function mountWaiters(): Map<string, PendingMount[]> {
  const registry = globalThis as MountRegistry
  return (registry[WAITERS] ??= new Map())
}

/**
 * Wrap a cordis plugin apply so the package runs at most once per process.
 * @param packageName - npm package identity shared by every install source.
 * @param fn - the original plugin apply.
 * @returns an apply of the same shape.
 */
export function mountOnce<T extends (...args: any[]) => unknown>(packageName: string, fn: T): T {
  const mount = (...args: unknown[]): unknown => {
    const mounted = mountedSet()
    const ctx = args[0] as MountContext | undefined
    if (mounted.has(packageName)) {
      const waiters = mountWaiters()
      const queue = waiters.get(packageName) ?? []
      let alive = true
      const pending: PendingMount = {
        run: () => {
          if (alive) mount(...args)
        },
      }
      // A fiber that dies while it waits must not be replayed afterwards: its
      // context is disposed and registering effects on it would throw.
      ctx?.effect?.(() => () => {
        alive = false
        const index = queue.indexOf(pending)
        if (index >= 0) queue.splice(index, 1)
      })
      queue.push(pending)
      waiters.set(packageName, queue)
      return
    }
    mounted.add(packageName)
    ctx?.effect?.(() => () => {
      mounted.delete(packageName)
      const waiters = mountWaiters()
      const queue = waiters.get(packageName)
      if (queue === undefined) return
      waiters.delete(packageName)
      // Defer the handover one microtask so the disposing mount's own effects
      // are torn down before the next one registers.
      for (const waiter of queue.splice(0)) queueMicrotask(() => { waiter.run() })
    })
    return fn(...args)
  }
  return mount as T
}
