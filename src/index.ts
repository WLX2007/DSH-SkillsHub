/**
 * skills-hub — host half. Serves the skill center data source: the
 * /api/skills-hub route family over the shared trust fence (loopback by
 * default; a live paired-device cookie is an extra allow path when
 * remote-web-ui is loaded).
 *
 * The browser half (./client) renders the center-column panel: the market tab
 * searches online skill registries, the skills tab manages what is installed,
 * and the create tab writes new skills.
 *
 * @module @wulongxi/dsh-skills-hub
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { makeRoutes, ROUTES, type SkillsHubRouteDeps } from './routes.ts'
import type { RegistrySkill } from './core/collect.ts'
import { mountOnce } from './mount-once.ts'

/** Stable cordis plugin name. */
export const name = 'skills-hub'

/**
 * Services required before the route family can mount: the route registry, the
 * skill registry the list merges against, and the session store that supplies
 * the active workspace.
 */
export const inject = ['webServer', 'skills', 'sessions']

/** Route paths, re-exported for the client contract check. */
export { ROUTES }

/**
 * Route-family builder, re-exported so the host logic can be driven against a
 * real temporary skill tree without booting a cordis composition.
 */
export { makeRoutes }
export type { SkillsHubRouteDeps }

/**
 * The market registry is NOT re-exported from this entry: the bundler folds a
 * re-exported binding into the single local binding its internal consumer
 * holds, and a bridge const then referenced the bundle's renamed local. The
 * market modules are emitted under their own entry instead (`lib/market.js` —
 * see tsdown.config.ts), which is what the tests import.
 */
export { skillsShSource, resolveOrigin as resolveSkillOrigin } from './market/sources/skills-sh.ts'
export { skillhubSource } from './market/sources/skillhub-cn.ts'
/** Plugin config (profile patch / settings surface). */
export interface Config {
  /** Master switch for the route family. */
  enabled?: boolean
  /** GitHub accelerator prefixes tried in order; '' means direct first (M2). */
  githubProxies?: string[]
  /** Extra custom skill root directories to scan. */
  customSkillDirs?: string[]
  /** User dsh config root override (defaults to $DSH_HOME or ~/.dsh). */
  dshHome?: string
}

/**
 * The slice of the host context this plugin reads.
 *
 * `skills` and `sessions` come from harness services that are not declared on
 * the published Context type, so they are read structurally here rather than by
 * importing a package that owns no such declaration.
 */
interface HostServiceContext {
  /** Skill registry: the merged, invocation-neutral catalog. */
  skills?: {
    snapshot(options: { cwd: string }): Promise<{ skills: RegistrySkill[]; complete: boolean }>
    get(name: string, options: { cwd: string }): Promise<{
      name: string
      description: string
      content: string
      path?: string
      source?: string
      provider?: string
    } | undefined>
  }
  /** In-memory session store: live sessions in creation order. */
  sessions?: { list(): Array<{ header?: { cwd?: string } }> }
  /**
   * The filesystem seam (`ctx.fs`, sandboxed). The skill-filesystem provider
   * listens for `fs/observed` mutations from the model's write/edit tools and
   * invalidates its catalog — but a plugin writing outside a tool call never
   * emits that event. The install route therefore emits it directly (below),
   * which is the same channel the official tools use, carrying an actor whose
   * name the provider's own mutation gate (`edit`/`write`) accepts.
   */
  fs?: {
    resolve(path: string, opts?: { cwd?: string }): Promise<{ targetKey: string; displayPath: string }>
  }
  /**
   * First-party event emitter. `ctx.emit("fs/observed", target, observation,
   * actor)` is how the official write tools announce a mutation; the
   * skill-filesystem provider subscribes and invalidates its skill catalog
   * when the actor is one of its recognized mutation tools.
   */
  emit?(event: string, ...args: unknown[]): void
}

/**
 * Mount the skills-hub routes.
 * @param ctx - host plugin context carrying webServer/skills/sessions.
 * @param config - resolved plugin config.
 */
function applyImpl(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return

  const services = ctx as unknown as HostServiceContext

  /** Active session workspace cwds, read at request time (never cached). */
  const activeSessionCwds = (): string[] => {
    const sessions = services.sessions
    if (typeof sessions?.list !== 'function') return []
    return sessions
      .list()
      .map(session => session.header?.cwd)
      .filter((cwd): cwd is string => typeof cwd === 'string' && cwd !== '')
  }

  const deps: SkillsHubRouteDeps = {
    dshHome: config?.dshHome,
    customSkillDirs: Array.isArray(config?.customSkillDirs) ? config.customSkillDirs : [],
    // Read lazily: the registry service is injected, but a Composition that
    // mounts this row before it settles must still serve a degraded list rather
    // than fail the mount.
    get registry() {
      const skills = services.skills
      if (typeof skills?.snapshot !== 'function') return undefined
      // Bind so the method keeps its receiver.
      return { snapshot: (options: { cwd: string }) => skills.snapshot(options) }
    },
    // Same lazy stance: preview must degrade to the file-backed path when the
    // registry cannot load, never fail the mount.
    get loadSkill() {
      const skills = services.skills
      if (typeof skills?.get !== 'function') return undefined
      return (name: string, options: { cwd: string }) => skills.get(name, options)
    },
    // Config override for the market's accelerator chain; undefined keeps the
    // built-in chain, which tries GitHub directly before any mirror.
    githubProxies: Array.isArray(config?.githubProxies)
      ? config.githubProxies.filter((proxy): proxy is string => typeof proxy === 'string')
      : undefined,
    activeSessionCwds,
    logger: { warn: (error: unknown) => ctx.logger.warn(error) },
    /**
     * Announce a first-party skill mutation the same way the model's write
     * tools do: resolve the path through the sandboxed fs seam, then emit
     * `fs/observed` with an actor named `write` — the exact name the
     * skill-filesystem provider's mutation gate accepts. The provider
     * invalidates its catalog and notifies every session, so an installed
     * skill is invocable in the very next turn without a restart. Degrades to
     * a no-op when either service is absent: the chokidar watcher on the skill
     * roots remains the fallback (it watches the filesystem itself, not the
     * tools), so the bridge is an accelerator, not a correctness dependency.
     */
    announceMutation: async (path: string): Promise<void> => {
      try {
        const target = await services.fs?.resolve(path)
        if (target === undefined) return
        services.emit?.('fs/observed', target, { kind: 'present', version: `${Date.now()}` }, { name: 'write' })
      } catch (error) {
        ctx.logger.warn(error)
      }
    },
  }

  const routes = makeRoutes(ctx, deps)

  ctx.effect(() => {
    const disposers = routes.map(route => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'skills-hub: routes')
}

/**
 * Single-instance guard: the aggregate bundle and a standalone install of this
 * package can coexist in one profile, so the second host apply must be a no-op
 * instead of re-registering the same routes and failing the boot.
 */
export const apply = mountOnce('@wulongxi/dsh-skills-hub', applyImpl)
