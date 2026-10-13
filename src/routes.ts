/**
 * The /api/skills-hub route family.
 *
 * Every route carries the shared trust fence (loopback by default; a live
 * paired-device cookie is an extra allow path when remote-web-ui is loaded) plus
 * browser same-origin markers.
 *
 * Local-management routes (M1): list (grouped by source), read, set-enabled,
 * set-provider-enabled, create, update, delete, health. The market routes land
 * in M2-M4 and append to the same table.
 *
 * Write-route trust rule: a client-submitted `path` is only an identity CLAIM.
 * Before touching any file the host re-scans and requires the same name to
 * resolve to that exact path, so a project skill that disappeared can never be
 * redirected onto a same-named user skill, and the routes cannot be used to
 * write arbitrary paths.
 *
 * @module @wulongxi/dsh-skills-hub/routes
 */

/**
 * The /api/skills-hub route family.
 *
 * Every route carries the shared trust fence (loopback by default; a live
 * paired-device cookie is an extra allow path when remote-web-ui is loaded) plus
 * browser same-origin markers.
 *
 * Local-management routes (M1): list (grouped by source), read, set-enabled,
 * set-provider-enabled, create, update, delete, health.
 *
 * Market routes (M2): market/search, market/detail, market/list-repo and
 * market/sources. Every market route accepts only opaque skill ids — never a
 * URL, a repository, or a file path — so the browser cannot aim the host's
 * network access anywhere the market sources did not already offer.
 *
 * Write-route trust rule: a client-submitted `path` is only an identity CLAIM.
 * Before touching any file the host re-scans and requires the same name to
 * resolve to that exact path, so a project skill that disappeared can never be
 * redirected onto a same-named user skill, and the routes cannot be used to
 * write arbitrary paths.
 *
 * @module @wulongxi/dsh-skills-hub/routes
 */

import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isSkillsHubAllowed } from './access.ts'
import { Market } from './market/registry.ts'
import { MarketFetchError } from './market/fetch.ts'
import { installSkill, listInstalled } from './market/installer.ts'
import {
  buildPayload,
  collectSkills,
  customSkillDirsFromLoader,
  findProjectRoot,
  isSkillName,
  normalizeSkillRoots,
  overwriteSkillFile,
  projectSkillRoot,
  trashSkillFile,
  userSkillRoot,
  writeSkillFile,
  type CollectOptions,
  type LoaderEntryLike,
  type SkillEntry,
} from './core/collect.ts'
import { parseFrontmatter, setFrontmatterField, stripFrontmatter } from './core/frontmatter.ts'
import { providerSkillIdentity, readProviderToggles, setProviderSkillEnabled, type ProviderSkillIdentity } from './core/provider-toggles.ts'
import { readJsonBody, writeJson } from './http.ts'

/** Build-time constant: the package version, injected by tsdown's define. */
declare const __DSH_PKG_VERSION__: string
/** The version recorded in a provenance record. */
const PLUGIN_VERSION: string = typeof __DSH_PKG_VERSION__ === 'string' ? __DSH_PKG_VERSION__ : ''

/** Route paths (the client bundle mirrors these literals; tests assert both sides). */
export const ROUTES = {
  /** Local skills, grouped by source. */
  list: '/api/skills-hub/list',
  /** One skill's editable fields and body. */
  read: '/api/skills-hub/read',
  /** One skill rendered for preview, including runtime-registered ones. */
  preview: '/api/skills-hub/preview',
  /** Enable/disable by rewriting frontmatter. */
  setEnabled: '/api/skills-hub/set-enabled',
  /** Enable/disable a plugin-provided skill in the panel's own store. */
  setProviderEnabled: '/api/skills-hub/set-provider-enabled',
  /** Create a new skill under the user or project root. */
  create: '/api/skills-hub/create',
  /** Rewrite an existing skill in place. */
  update: '/api/skills-hub/update',
  /** Move a skill into .trash. */
  delete: '/api/skills-hub/delete',
  /** Market search across the registered online sources. */
  marketSearch: '/api/skills-hub/market/search',
  /** One market skill's readable detail. */
  marketDetail: '/api/skills-hub/market/detail',
  /** The skills of one repository the user named. */
  marketListRepo: '/api/skills-hub/market/list-repo',
  /** Which market sources exist and whether they answered. */
  marketSources: '/api/skills-hub/market/sources',
  /** Install one market skill into the user or project skill root. */
  marketInstall: '/api/skills-hub/market/install',
  /** Skills this panel installed, with their provenance records. */
  marketInstalled: '/api/skills-hub/market/installed',
  /** Liveness and capability probe. */
  health: '/api/skills-hub/health',
} as const

/** URL query helper (first value). */
function queryParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)
  return value === null ? undefined : value
}

/**
 * The client's cancellation for a market request.
 *
 * The webserver does not hand the handler an abort signal, so there is nothing
 * to compose yet; the undefined signal lets the market layer fall back to its
 * own timeout, which is what bounds a hung origin. When the server surfaces
 * request aborts, this is the single seam that picks them up.
 * @returns undefined for now.
 */
function reqSignal(_req: IncomingMessage): undefined {
  return undefined
}

/** Route family dependencies (tests inject fakes). */
export interface SkillsHubRouteDeps {
  /** User dsh config root; undefined means "resolve from the environment". */
  dshHome: string | undefined
  /** Extra custom skill roots from this plugin's own config. */
  customSkillDirs: readonly string[]
  /** ctx.skills registry (snapshot). */
  registry: CollectOptions['registry'] | undefined
  /**
   * ctx.skills.get(): loads one skill's full definition, including its body.
   *
   * This is the ONLY way to read the content of a runtime-registered or
   * bundled skill: those have no SKILL.md this panel may open, so a preview
   * that only read files would show nothing for exactly the skills a user most
   * wants to inspect. Loads on demand, so it is called per preview request
   * rather than captured at mount.
   */
  loadSkill: ((name: string, options: { cwd: string }) => Promise<{ name: string; description: string; content: string; path?: string; source?: string; provider?: string } | undefined>) | undefined
  /** Active session workspace cwds. */
  activeSessionCwds(): string[]
  /**
   * GitHub accelerator prefixes for market fetches, in preference order.
   * Undefined uses the built-in chain, which tries GitHub directly first.
   */
  githubProxies?: readonly string[]
  /** Logger. */
  logger: { warn(error: unknown): void }
  /**
   * Announce a first-party mutation of an installed skill's directory, so the
   * skill-filesystem provider invalidates its catalog without waiting for its
   * own watcher. Resolves the path through the host's fs seam and emits the
   * same `fs/observed` event the model's write tools emit. Absent means the
   * services are unavailable and the watcher remains the only mechanism.
   */
  announceMutation?(path: string): Promise<void>
}

/** Default process cwd fallback (overridable in tests). */
export const DEFAULT_CWD = (): string => process.cwd()

/** Resolve the user dsh home (config, then $DSH_HOME, then ~/.dsh). */
function resolveDshHome(configured: string | undefined): string {
  if (typeof configured === 'string' && configured.trim() !== '') return configured
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  return join(homedir(), '.dsh')
}

/** Resolve the user agents home ($DSH_AGENTS_HOME, then ~/.agents). */
function resolveAgentsHome(): string {
  const fromEnv = process.env.DSH_AGENTS_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  return `${homedir()}${sep}.agents`
}

/**
 * Build every /api/skills-hub route.
 * @param ctx - host context; may expose remoteWebUiPairing and loader.
 * @param deps - resolved config, registry, sessions, logger.
 * @returns the route list for ctx.webServer.register.
 */
export function makeRoutes(ctx: Context, deps: SkillsHubRouteDeps): WebRoute[] {
  const { logger } = deps
  const dshHome = resolveDshHome(deps.dshHome)
  const agentsHome = resolveAgentsHome()

  // The market instance is per-route-family, so its caches live for the
  // process lifetime: a repository tree cached now is reused by every later
  // search and detail view, which is what makes the 60/hour API budget usable.
  const market = new Market({ proxies: deps.githubProxies })

  /** Report a market failure: a source error is expected, not an exception. */
  const marketFail = (res: ServerResponse, error: unknown): void => {
    logger.warn(error)
    const status = error instanceof MarketFetchError && error.code === 'too-large' ? 502 : 502
    writeJson(res, status, { error: error instanceof Error ? error.message : String(error) })
  }

  /**
   * Every custom skill root the panel should scan: this plugin's own config plus
   * whatever the live `skill-filesystem` rows declare. The official documented
   * placement is the provider row (a profile patch), not this plugin, so reading
   * only this plugin's config would leave those skills listed with no editable
   * path and every write route answering 404.
   */
  const resolveCustomSkillDirs = (): string[] => {
    const own = Array.isArray(deps.customSkillDirs) ? deps.customSkillDirs : []
    let fromRows: string[] = []
    try {
      // Non-strict read: the loader is present in every real composition but is
      // not a declared dependency of this plugin, so a shell without one must
      // degrade to the plugin's own config instead of failing the mount.
      const loader = (ctx as unknown as { get(name: string, strict?: boolean): unknown }).get('loader', false) as { entries?: () => Iterable<LoaderEntryLike> } | undefined
      if (typeof loader?.entries === 'function') fromRows = customSkillDirsFromLoader(loader.entries())
    } catch {
      fromRows = []
    }
    return normalizeSkillRoots([...own, ...fromRows])
  }

  /** Active session workspace cwds (degraded to [] when the registry is unavailable). */
  const safeSessionCwds = (): string[] => {
    try {
      return deps.activeSessionCwds()
    } catch {
      return []
    }
  }

  /** Active session project roots (degraded to [] when sessions throw). */
  const sessionProjectRoots = (): string[] => {
    try {
      return safeSessionCwds().map(sessionCwd => findProjectRoot(sessionCwd))
    } catch {
      return []
    }
  }

  /**
   * The workspace the panel is showing: an explicit override, then the active
   * session workspace, then the process cwd. The write routes resolve their
   * workspace through the same helper as the list route, so a write never
   * re-scans a different project root than the panel just displayed.
   */
  const panelCwd = (override?: string): string =>
    (override !== undefined && override.trim() !== '' ? override : undefined)
    ?? safeSessionCwds()[0]
    ?? DEFAULT_CWD()

  /**
   * Collect options shared by every handler. The provider switches are read per
   * request (not captured at mount) so a toggle the user just made is honored by
   * the very next list, and a restart picks the stored set back up.
   */
  const collectOptions = async (cwd: string): Promise<CollectOptions> => ({
    cwd,
    projectRoots: sessionProjectRoots(),
    customSkillDirs: resolveCustomSkillDirs(),
    dshHome,
    agentsHome,
    registry: deps.registry ?? { snapshot: async () => ({ skills: [], complete: true }) },
    providerDisabledSkills: (await readProviderToggles(dshHome)).disabled,
  })

  /** Find a skill by name from a fresh collection pass. */
  const findSkill = async (name: string, cwd: string): Promise<SkillEntry | undefined> => {
    const { skills } = await collectSkills(await collectOptions(cwd))
    return skills.find(candidate => candidate.name === name)
  }

  /**
   * Find a currently listed plugin-provided skill by its stable identity.
   *
   * The write route for the panel-local switch has no path to certify, so it
   * uses the identity the panel displayed: a fresh collection must resolve the
   * same (provider, name) pair to a `provider-file` row.
   */
  const findProviderSkill = async (identity: ProviderSkillIdentity, cwd: string): Promise<SkillEntry | undefined> => {
    const { skills } = await collectSkills(await collectOptions(cwd))
    return skills.find(candidate => candidate.fileState === 'provider-file'
      && candidate.name === identity.name
      && (candidate.provider ?? '') === identity.provider)
  }

  /** Resolve the exact file the panel showed, rejecting stale same-name fallbacks. */
  const resolveScannedSkill = async (
    name: string,
    expectedPath: string,
    cwd: string,
    res: ServerResponse,
  ): Promise<(SkillEntry & { path: string }) | undefined> => {
    const skill = await findSkill(name, cwd)
    if (skill?.path === undefined) {
      writeJson(res, 404, { error: `skill ${name} has no editable file` })
      return undefined
    }
    if (skill.path !== expectedPath) {
      writeJson(res, 409, { error: `skill ${name} changed since the panel loaded; refresh and retry` })
      return undefined
    }
    return skill as SkillEntry & { path: string }
  }

  /** Guard helper: trust fence plus method check. */
  const guard = (req: IncomingMessage, res: ServerResponse, method: string): boolean => {
    if (!isSkillsHubAllowed(ctx, req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return false
    }
    if (req.method !== method) {
      writeJson(res, 405, { error: `method not allowed: ${req.method}` })
      return false
    }
    return true
  }

  /** Report a handler failure with the host-side message. */
  const fail = (res: ServerResponse, error: unknown, status = 500): void => {
    logger.warn(error)
    writeJson(res, status, { error: error instanceof Error ? error.message : String(error) })
  }

  const routes: WebRoute[] = [
    {
      kind: 'exact',
      path: ROUTES.list,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          const url = new URL(req.url ?? '/', 'http://x')
          const cwd = panelCwd(queryParam(url, 'cwd'))
          const projectRoots = sessionProjectRoots()
          const { skills, complete } = await collectSkills(await collectOptions(cwd))
          writeJson(res, 200, buildPayload(skills, complete, cwd, [...new Set(projectRoots)]))
        } catch (error) {
          fail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.preview,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          const url = new URL(req.url ?? '/', 'http://x')
          const name = queryParam(url, 'name')
          if (name === undefined || !isSkillName(name)) {
            writeJson(res, 400, { error: 'expected ?name=<kebab-case>' })
            return
          }
          const cwd = panelCwd(queryParam(url, 'cwd'))

          // Source 1: a fresh scan. Its path is the one the write routes trust
          // and the only one whose bytes this panel may read directly.
          const scanned = await findSkill(name, cwd)
          if (scanned?.path !== undefined) {
            const raw = readFileSync(scanned.path, 'utf8')
            const frontmatter = parseFrontmatter(raw)
            // Only the BODY goes to the markdown renderer. The leading `---`
            // fence is a thematic break in GFM, which would turn the YAML
            // lines above it into a setext heading and print the frontmatter as
            // stray `key: value` prose. The fields travel separately instead.
            writeJson(res, 200, {
              name,
              path: scanned.path,
              level: scanned.level,
              description: frontmatter.description ?? scanned.description,
              ...(frontmatter.whenToUse === undefined ? {} : { whenToUse: frontmatter.whenToUse }),
              modelInvocable: scanned.modelInvocable,
              userInvocable: scanned.userInvocable,
              linked: scanned.linked === true,
              fileState: scanned.fileState,
              source: 'file',
              markdown: stripFrontmatter(raw).trim(),
            })
            return
          }

          // Source 2: the registry. A bundled or runtime-registered skill has no
          // file to open, so `ctx.skills.get()` is the only way to read its
          // instructions — and those are exactly the skills worth previewing,
          // since they cannot be inspected on disk. It returns the body alone,
          // already free of frontmatter.
          const loaded = await deps.loadSkill?.(name, { cwd })
          if (loaded === undefined) {
            writeJson(res, 404, { error: `skill ${name} is not loaded by this host` })
            return
          }
          writeJson(res, 200, {
            name,
            ...(scanned?.path === undefined ? {} : { path: scanned.path }),
            level: scanned?.level ?? 'runtime',
            description: loaded.description,
            modelInvocable: scanned?.modelInvocable ?? true,
            userInvocable: scanned?.userInvocable ?? true,
            linked: false,
            fileState: scanned?.fileState ?? 'virtual',
            source: 'registry',
            ...(loaded.provider === undefined ? {} : { provider: loaded.provider }),
            markdown: loaded.content,
          })
        } catch (error) {
          fail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.read,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          const url = new URL(req.url ?? '/', 'http://x')
          const name = queryParam(url, 'name')
          const path = queryParam(url, 'path')
          if (name === undefined || !isSkillName(name) || path === undefined || path.trim() === '') {
            writeJson(res, 400, { error: 'expected ?name=<kebab-case>&path=<absolute SKILL.md>' })
            return
          }
          // The submitted path is only an identity claim: a fresh scan must
          // resolve the same file the panel showed, so no request can read an
          // arbitrary path.
          const skill = await resolveScannedSkill(name, path, panelCwd(), res)
          if (skill === undefined) return
          const raw = readFileSync(skill.path, 'utf8')
          const frontmatter = parseFrontmatter(raw)
          writeJson(res, 200, {
            name,
            path: skill.path,
            description: frontmatter.description ?? skill.description,
            ...(frontmatter.whenToUse === undefined ? {} : { whenToUse: frontmatter.whenToUse }),
            content: stripFrontmatter(raw).trim(),
          })
        } catch (error) {
          fail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.setEnabled,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        try {
          const body = await readJsonBody(req, { maxBytes: 128 * 1024, objectOnly: true })
          if (body === null) {
            writeJson(res, 400, { error: 'invalid JSON body' })
            return
          }
          const payload = body as Record<string, unknown>
          const { name, path, enabled } = payload
          if (typeof name !== 'string' || !isSkillName(name) || typeof path !== 'string' || path.trim() === '' || typeof enabled !== 'boolean') {
            writeJson(res, 400, { error: 'expected { name, path, enabled }' })
            return
          }
          const skill = await resolveScannedSkill(name, path, panelCwd(), res)
          if (skill === undefined) return
          // Disabled = disable-model-invocation: true; enabled = false.
          const frontmatter = setFrontmatterField(skill.path, 'disable-model-invocation', enabled ? false : true)
          writeJson(res, 200, {
            name,
            enabled: frontmatter.disableModelInvocation !== true,
            modelInvocable: frontmatter.disableModelInvocation !== true,
            path: skill.path,
          })
        } catch (error) {
          fail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.setProviderEnabled,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        try {
          const body = await readJsonBody(req, { maxBytes: 8 * 1024, objectOnly: true })
          if (body === null) {
            writeJson(res, 400, { error: 'invalid JSON body' })
            return
          }
          const payload = body as Record<string, unknown>
          const { name, provider, enabled } = payload
          if (typeof name !== 'string' || typeof enabled !== 'boolean' || (provider !== undefined && typeof provider !== 'string')) {
            writeJson(res, 400, { error: 'expected { name, provider, enabled }' })
            return
          }
          const identity = providerSkillIdentity(name, provider)
          if (identity === undefined) {
            writeJson(res, 400, { error: 'name must be kebab-case (lowercase letters/digits first) and provider a short provider id' })
            return
          }
          if (enabled) {
            // Enabling only ever drops a record, so it stays allowed for a skill
            // the panel no longer lists: a plugin can be uninstalled while its
            // record is still stored, and that record must remain removable.
            await setProviderSkillEnabled(dshHome, identity, true)
            writeJson(res, 200, { ok: true, name: identity.name, provider: identity.provider, disabled: false })
            return
          }
          // Disabling creates a record the panel honors from the next list on,
          // so it must address a skill a fresh collection still lists as
          // plugin-provided — the same "only what the panel showed" rule the file
          // write routes follow, here with the identity instead of a path.
          const skill = await findProviderSkill(identity, panelCwd())
          if (skill === undefined) {
            writeJson(res, 404, { error: `skill ${identity.name} is not a plugin-provided skill with a local file` })
            return
          }
          await setProviderSkillEnabled(dshHome, identity, false)
          writeJson(res, 200, { ok: true, name: identity.name, provider: identity.provider, disabled: true })
        } catch (error) {
          fail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.create,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        try {
          const body = await readJsonBody(req, { maxBytes: 128 * 1024, objectOnly: true })
          if (body === null) {
            writeJson(res, 400, { error: 'invalid JSON body' })
            return
          }
          const payload = body as Record<string, unknown>
          const { root, name, description, whenToUse, content, cwd } = payload
          if (root !== 'user' && root !== 'project') {
            writeJson(res, 400, { error: 'root must be user (~/.dsh/skills) or project (project .dsh/skills)' })
            return
          }
          if (typeof cwd !== 'string' || cwd.trim() === '') {
            writeJson(res, 400, { error: 'cwd is required (the workspace shown by the panel)' })
            return
          }
          if (typeof name !== 'string' || !isSkillName(name)) {
            writeJson(res, 400, { error: 'name must be kebab-case (lowercase letters/digits first)' })
            return
          }
          if (typeof description !== 'string' || description.trim() === '') {
            writeJson(res, 400, { error: 'description is required' })
            return
          }
          if (typeof content !== 'string' || content.trim() === '') {
            writeJson(res, 400, { error: 'content is required' })
            return
          }
          if (Buffer.byteLength(content, 'utf8') > 64 * 1024) {
            writeJson(res, 400, { error: 'content exceeds 64KB limit' })
            return
          }
          const baseDir = root === 'user'
            ? userSkillRoot(dshHome)
            : projectSkillRoot(findProjectRoot(cwd))
          const target = await writeSkillFile(baseDir, name, description, typeof whenToUse === 'string' ? whenToUse : undefined, content)
          writeJson(res, 200, { ok: true, name, path: target })
        } catch (error) {
          if (error instanceof Error && /already exists/.test(error.message)) {
            writeJson(res, 409, { error: error.message })
            return
          }
          fail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.update,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        try {
          const body = await readJsonBody(req, { maxBytes: 128 * 1024, objectOnly: true })
          if (body === null) {
            writeJson(res, 400, { error: 'invalid JSON body' })
            return
          }
          const payload = body as Record<string, unknown>
          const { name, path, description, whenToUse, content } = payload
          if (typeof name !== 'string' || !isSkillName(name) || typeof path !== 'string' || path.trim() === '') {
            writeJson(res, 400, { error: 'expected { name, path, description, content }' })
            return
          }
          if (typeof description !== 'string' || description.trim() === '') {
            writeJson(res, 400, { error: 'description is required' })
            return
          }
          if (typeof content !== 'string' || content.trim() === '') {
            writeJson(res, 400, { error: 'content is required' })
            return
          }
          if (Buffer.byteLength(content, 'utf8') > 64 * 1024) {
            writeJson(res, 400, { error: 'content exceeds 64KB limit' })
            return
          }
          const skill = await resolveScannedSkill(name, path, panelCwd(), res)
          if (skill === undefined) return
          // A linked skill lives behind a symlink: rewriting it would edit a file
          // outside this skill root, so the panel must not offer it.
          if (skill.linked === true) {
            writeJson(res, 400, { error: `skill ${name} is a linked skill and cannot be edited` })
            return
          }
          // The enabled state is not part of the edit form: carry it over so an
          // edit never silently re-enables a disabled skill.
          const disabled = parseFrontmatter(readFileSync(skill.path, 'utf8')).disableModelInvocation === true
          const target = await overwriteSkillFile(skill.path, name, description.trim(), typeof whenToUse === 'string' ? whenToUse : undefined, content, disabled)
          writeJson(res, 200, { ok: true, name, path: target, disabled })
        } catch (error) {
          fail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.delete,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        try {
          const body = await readJsonBody(req, { maxBytes: 128 * 1024, objectOnly: true })
          if (body === null) {
            writeJson(res, 400, { error: 'invalid JSON body' })
            return
          }
          const payload = body as Record<string, unknown>
          const { name, path } = payload
          if (typeof name !== 'string' || !isSkillName(name) || typeof path !== 'string' || path.trim() === '') {
            writeJson(res, 400, { error: 'expected { name, path }' })
            return
          }
          const skill = await resolveScannedSkill(name, path, panelCwd(), res)
          if (skill === undefined) return
          // A linked skill lives behind a symlink (mount-of-intent content, not
          // created under this root). Deleting it would move the target's real
          // SKILL.md out of place, escaping this skill root — refuse deletion.
          if (skill.linked === true) {
            writeJson(res, 400, { error: `skill ${name} is a linked skill and cannot be deleted` })
            return
          }
          const moved = await trashSkillFile(skill.path)
          writeJson(res, 200, { ok: true, name, moved })
        } catch (error) {
          fail(res, error)
        }
      },
    },

    // --- Market routes (M2) -------------------------------------------------
    //
    // Every market route accepts opaque skill ids only. The browser never sends
    // a URL, a repository name, or a file path, so the host's network access
    // cannot be aimed anywhere the market sources did not already offer.

    {
      kind: 'exact',
      path: ROUTES.marketSearch,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          const url = new URL(req.url ?? '/', 'http://x')
          const query = queryParam(url, 'q') ?? ''
          const limitRaw = Number(queryParam(url, 'limit'))
          // Bounded both ways: a huge limit cannot drain a registry page into
          // the response, and a non-numeric one cannot NaN the slice.
          const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50) : 20
          // The source the user picked before searching. Undefined searches
          // every source; a name the host does not register is rejected by the
          // market layer rather than silently widened to "all".
          const source = queryParam(url, 'source')
          // "Load more" asks for page 2, 3, …; page one is the initial search.
          const pageRaw = Number(queryParam(url, 'page'))
          const page = Number.isFinite(pageRaw) ? Math.min(Math.max(Math.trunc(pageRaw), 1), 100) : 1
          const outcome = await market.search(query, limit, reqSignal(req), source, page)
          writeJson(res, 200, {
            query,
            limit,
            page,
            hasMore: outcome.hasMore,
            ...(source === undefined ? {} : { source }),
            skills: outcome.skills,
            counts: outcome.counts,
            failures: outcome.failures,
          }, { 'cache-control': 'no-store' })
        } catch (error) {
          marketFail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.marketDetail,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          const url = new URL(req.url ?? '/', 'http://x')
          const id = queryParam(url, 'id')
          if (id === undefined || id.trim() === '') {
            writeJson(res, 400, { error: 'expected ?id=<skill id>' })
            return
          }
          const detail = await market.detail(id, reqSignal(req))
          if (detail === undefined) {
            writeJson(res, 404, { error: `skill ${id} is not offered by any market source` })
            return
          }
          writeJson(res, 200, detail, { 'cache-control': 'no-store' })
        } catch (error) {
          marketFail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.marketListRepo,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          const url = new URL(req.url ?? '/', 'http://x')
          const repo = queryParam(url, 'repo')
          if (repo === undefined || repo.trim() === '') {
            writeJson(res, 400, { error: 'expected ?repo=<owner/repo>' })
            return
          }
          const skills = await market.listRepo(repo, reqSignal(req))
          writeJson(res, 200, { repo, skills }, { 'cache-control': 'no-store' })
        } catch (error) {
          marketFail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.marketSources,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        writeJson(res, 200, {
          sources: market.listSources().map(source => ({ name: source.name, searchable: source.searchable, pageable: source.pageable })),
        }, { 'cache-control': 'no-store' })
      },
    },
    {
      kind: 'exact',
      path: ROUTES.marketInstall,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        try {
          const body = await readJsonBody(req, { maxBytes: 8 * 1024, objectOnly: true })
          if (body === null) {
            writeJson(res, 400, { error: 'invalid JSON body' })
            return
          }
          const payload = body as Record<string, unknown>
          const { id, root, cwd } = payload
          if (typeof id !== 'string' || id.trim() === '') {
            writeJson(res, 400, { error: 'expected { id, root, cwd }' })
            return
          }
          if (root !== 'user' && root !== 'project') {
            writeJson(res, 400, { error: 'root must be user (~/.dsh/skills) or project (project .dsh/skills)' })
            return
          }
          if (typeof cwd !== 'string' || cwd.trim() === '') {
            writeJson(res, 400, { error: 'cwd is required (the workspace shown by the panel)' })
            return
          }
          // The install target is derived from the workspace the panel is
          // showing, exactly as the create route does — never from a
          // client-supplied directory.
          const result = await installSkill(market, id, root, findProjectRoot(cwd), dshHome, PLUGIN_VERSION, reqSignal(req))
          // Announce the mutation on the official channel so the provider's
          // catalog invalidates immediately — the installed skill is
          // invocable in the next turn, no restart. Best-effort: the watcher
          // on the skill roots is the fallback.
          await deps.announceMutation?.(result.path)
          writeJson(res, 200, { ok: true, ...result }, { 'cache-control': 'no-store' })
        } catch (error) {
          if (error instanceof Error && /already exists|not a valid skill name|unsafe path|over the|not offered by any market source|exceeds/.test(error.message)) {
            writeJson(res, error.message.includes('already exists') ? 409 : 400, { error: error.message })
            return
          }
          marketFail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.marketInstalled,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          const url = new URL(req.url ?? '/', 'http://x')
          const cwd = panelCwd(queryParam(url, 'cwd'))
          const installed = await listInstalled(dshHome, findProjectRoot(cwd))
          writeJson(res, 200, { installed }, { 'cache-control': 'no-store' })
        } catch (error) {
          fail(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.health,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          const { skills } = await collectSkills(await collectOptions(panelCwd()))
          writeJson(res, 200, {
            ok: true,
            plugin: 'skills-hub',
            version: 1,
            skills: skills.length,
            dshHome,
            customSkillDirs: resolveCustomSkillDirs(),
            capabilities: {
              localManagement: true,
              market: false,
            },
          })
        } catch (error) {
          fail(res, error)
        }
      },
    },
  ]

  return routes
}
