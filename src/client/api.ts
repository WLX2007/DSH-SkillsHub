/**
 * Skills-hub API client (browser half). Talks to the host route family over
 * same-origin fetch; the host enforces the trust fence on its side.
 *
 * Route paths are DOCUMENT-RELATIVE on purpose (no leading slash): the harness
 * serves the GUI with `<base href="./">`, so a sub-path deployment is the entry
 * directory. A root-absolute `/api/...` escapes that prefix and the request
 * never reaches the plugin's route. The official client posts its own routes the
 * same way (`api/session.list`).
 *
 * @module @wulongxi/dsh-skills-hub/client/api
 */

/** Route paths mirrored from the host (src/routes.ts ROUTES). */
const API = {
  list: 'api/skills-hub/list',
  read: 'api/skills-hub/read',
  preview: 'api/skills-hub/preview',
  setEnabled: 'api/skills-hub/set-enabled',
  setProviderEnabled: 'api/skills-hub/set-provider-enabled',
  create: 'api/skills-hub/create',
  update: 'api/skills-hub/update',
  delete: 'api/skills-hub/delete',
  health: 'api/skills-hub/health',
} as const

/**
 * What backs a skill locally (host-classified).
 *
 * - `editable`: a filesystem scan resolved the SKILL.md; `path` is writable.
 * - `provider-file`: a plugin provider reports a real instruction file the
 *   panel's scan did not resolve. The file exists, but the write routes do not
 *   trust this path, so the row offers no file controls — it does carry the
 *   enable switch, which the host records in the panel's own store.
 * - `virtual`: no instruction file exists; "no local file" is accurate.
 */
export type SkillFileState = 'editable' | 'provider-file' | 'virtual'

/** One skill entry as served by the host. */
export interface SkillEntry {
  name: string
  description: string
  whenToUse?: string
  provider?: string
  level: string
  path?: string
  /** What backs this skill locally (see SkillFileState). */
  fileState: SkillFileState
  /** True for skills discovered through a symlink entry (deletion not allowed). */
  linked?: boolean
  modelInvocable: boolean
  userInvocable: boolean
  /** Project workspace root path this skill belongs to. */
  workspaceRoot?: string
  /** Display name of the workspace directory. */
  workspaceName?: string
  /** True when the skill belongs to the primary active session workspace. */
  isActiveWorkspace?: boolean
}

/** Group payload served by the host. */
export interface GroupPayload {
  key: string
  title: string
  hint: string
  skills: SkillEntry[]
}

/** Workspace item descriptor. */
export interface WorkspaceItem {
  root: string
  name: string
  active: boolean
}

/** List payload served by the host. */
export interface ListPayload {
  cwd: string
  projectRoots: string[]
  complete: boolean
  groups: GroupPayload[]
  workspaces?: WorkspaceItem[]
}

/** Health payload served by the host. */
export interface HealthPayload {
  ok: boolean
  plugin: string
  version: number
  /** Number of skills the host's scan resolved. */
  skills: number
  /** Resolved user dsh root, or null when the host could not resolve one. */
  dshHome: string | null
  customSkillDirs: string[]
  /** Which milestone capabilities this host build actually serves. */
  capabilities: {
    localManagement: boolean
    market: boolean
  }
}

/** One skill's editable fields and body. */
export interface SkillDocument {
  name: string
  path: string
  description: string
  whenToUse?: string
  content: string
}

/**
 * One skill prepared for preview.
 *
 * `markdown` is a SKILL.md-shaped document (frontmatter block, then the body)
 * for EVERY skill, so the preview looks the same whether the bytes came off
 * disk or out of the registry. `source` says which it was: a runtime-registered
 * skill has no file of its own, and the preview states that rather than
 * pretending a path exists.
 */
export interface SkillPreview {
  name: string
  /** Absolute SKILL.md path, present only when the skill is file-backed. */
  path?: string
  level: string
  description: string
  whenToUse?: string
  modelInvocable: boolean
  userInvocable: boolean
  linked: boolean
  fileState: SkillFileState
  /** Where the preview's text came from. */
  source: 'file' | 'registry'
  provider?: string
  /** The rendered document. */
  markdown: string
}

/** One thrown API error with the host-provided message. */
export class ApiError extends Error {}

/** Skills-hub API client. */
export class SkillsHubApi {
  /** Fetch the grouped skill list. */
  async list(cwd?: string): Promise<ListPayload> {
    const url = typeof cwd === 'string' && cwd.trim() !== ''
      ? `${API.list}?cwd=${encodeURIComponent(cwd)}`
      : API.list
    return this.request<ListPayload>(url)
  }

  /** Enable or disable a skill (rewrites disable-model-invocation). */
  async setEnabled(name: string, path: string, enabled: boolean): Promise<{ name: string; enabled: boolean; modelInvocable: boolean; path?: string }> {
    return this.request(API.setEnabled, { method: 'POST', body: { name, path, enabled } })
  }

  /**
   * Switch a plugin-provided skill off/on in this panel.
   *
   * There is no path to certify: the row's file belongs to the provider and sits
   * outside the roots this panel scans, so the host records the (provider, name)
   * pair in the panel's own store instead of rewriting a SKILL.md the panel does
   * not own.
   */
  async setProviderEnabled(name: string, provider: string | undefined, enabled: boolean): Promise<{ ok: true; name: string; provider: string; disabled: boolean }> {
    return this.request(API.setProviderEnabled, { method: 'POST', body: { name, provider, enabled } })
  }

  /** Create a skill file under the user or project root. */
  async create(payload: { root: 'user' | 'project'; name: string; description: string; whenToUse?: string; content: string; cwd: string }): Promise<{ ok: true; name: string; path: string }> {
    return this.request(API.create, { method: 'POST', body: payload })
  }

  /** One skill's editable fields and body, resolved from the panel's path. */
  async read(name: string, path: string): Promise<SkillDocument> {
    return this.request(`${API.read}?name=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}`)
  }

  /**
   * One skill prepared for preview, by name alone.
   *
   * No path is sent: the host resolves the skill itself, so a runtime-registered
   * or bundled skill previews too. Those have no file this panel could open, and
   * they are the ones a user most needs to read.
   */
  async preview(name: string, cwd?: string): Promise<SkillPreview> {
    const url = typeof cwd === 'string' && cwd.trim() !== ''
      ? `${API.preview}?name=${encodeURIComponent(name)}&cwd=${encodeURIComponent(cwd)}`
      : `${API.preview}?name=${encodeURIComponent(name)}`
    return this.request<SkillPreview>(url)
  }

  /** Rewrite an existing skill file in place (name and location unchanged). */
  async update(payload: { name: string; path: string; description: string; whenToUse?: string; content: string }): Promise<{ ok: true; name: string; path: string; disabled: boolean }> {
    return this.request(API.update, { method: 'POST', body: payload })
  }

  /** Delete a skill (moves it into .trash). */
  async remove(name: string, path: string): Promise<{ ok: true; name: string; moved: string }> {
    return this.request(API.delete, { method: 'POST', body: { name, path } })
  }

  /** Liveness and capability probe. */
  async health(): Promise<HealthPayload> {
    return this.request<HealthPayload>(API.health)
  }

  private async request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers = options.body === undefined
      ? new Headers()
      : new Headers({ 'content-type': 'application/json' })
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    if (!response.ok) {
      const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `HTTP ${response.status}`
      throw new ApiError(message)
    }
    return body as T
  }
}
