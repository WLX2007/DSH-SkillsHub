/**
 * GitHub repository access for the market layer.
 *
 * Two access paths, chosen per request because the unauthenticated API budget
 * is only 60 requests per hour:
 *
 *  - **Contents / Trees API** for *discovery* (which directories hold a
 *    SKILL.md). One tree request lists a whole repository recursively, so a
 *    browse costs one API call rather than one per directory.
 *  - **raw.githubusercontent.com** for *file bodies*. Raw fetches do not touch
 *    the API budget at all, and they are what the accelerator chain can carry.
 *
 * The API host is called directly, never through a mirror: mirror operators
 * generally do not pass API traffic, and spending one of the 60 hourly calls on
 * a wrong guess is the worst outcome available here.
 *
 * @module @wulongxi/dsh-skills-hub/market/github
 */

import { MarketFetchError } from '../fetch.ts'
import type { MarketSourceContext, MarketOrigin, GitHubOrigin } from '../types.ts'

/** One entry from the Contents API. */
interface ContentsEntry {
  name: string
  path: string
  type: 'file' | 'dir' | 'symlink' | 'submodule'
  size: number
  download_url: string | null
}

/** One entry from the recursive Trees API. */
export interface TreeEntry {
  path: string
  type: 'blob' | 'tree' | 'commit'
  size?: number
}

/** The repository metadata needed to resolve a default branch. */
interface RepoInfo {
  default_branch: string
  private: boolean
  size: number
}

/** The filename that marks a directory as a skill. */
export const SKILL_FILE = 'SKILL.md'

/** Cap on a single raw file, matching what a SKILL.md may reasonably be. */
export const RAW_FILE_MAX_BYTES = 2 * 1024 * 1024

/** Cap on a recursive tree response, which is JSON metadata only. */
export const TREE_MAX_BYTES = 8 * 1024 * 1024

/**
 * Read a repository's default branch.
 *
 * Needed because a skill id may carry `HEAD`-like intent: `skills.sh` reports
 * `owner/repo` without a ref, and guessing `main` breaks every repository that
 * still uses `master`.
 *
 * @param owner - repository owner.
 * @param repo - repository name.
 * @param ctx - fetchers and signal.
 * @returns the default branch name.
 */
export async function defaultBranch(owner: string, repo: string, ctx: MarketSourceContext): Promise<string> {
  const info = await ctx.fetchJson<RepoInfo>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { signal: ctx.signal, timeoutMs: 20_000, maxBytes: 256 * 1024 },
  )
  if (typeof info?.default_branch !== 'string' || info.default_branch === '') {
    throw new MarketFetchError('parse', `${owner}/${repo} reported no default branch`)
  }
  return info.default_branch
}

/**
 * List every file in a repository at a ref, one API request.
 *
 * @param origin - repository coordinates; `dir` is ignored here.
 * @param ctx - fetchers and signal.
 * @returns the file entries, or undefined when the ref does not resolve.
 */
export async function listRepoTree(origin: GitHubOrigin, ctx: MarketSourceContext): Promise<TreeEntry[] | undefined> {
  const url = `https://api.github.com/repos/${encodeURIComponent(origin.owner)}/${encodeURIComponent(origin.repo)}`
    + `/git/trees/${encodeURIComponent(origin.ref)}?recursive=1`
  try {
    const payload = await ctx.fetchJson<{ tree?: TreeEntry[] }>(url, {
      signal: ctx.signal,
      timeoutMs: 25_000,
      maxBytes: TREE_MAX_BYTES,
    })
    return Array.isArray(payload?.tree) ? payload.tree : []
  } catch (error) {
    // A missing ref or repository is a normal answer for a user-typed
    // coordinate, not an internal failure: report it as "nothing here".
    if (error instanceof MarketFetchError && error.code === 'status' && error.status === 404) return undefined
    throw error
  }
}

/** One skill directory discovered in a tree. */
export interface DiscoveredSkill {
  /** Repository-relative directory ('' when SKILL.md sits at the root). */
  dir: string
  /** Skill name: its directory's basename. */
  name: string
  /** The SKILL.md entry. */
  file: TreeEntry
}

/**
 * Find every skill directory in a repository tree.
 *
 * A directory is a skill when it directly contains `SKILL.md`; the repository
 * root counts too, which is how a single-skill repository is browsable. Nested
 * skills are all reported, since `anthropics/skills` keeps them under `skills/`.
 *
 * @param tree - entries from {@link listRepoTree}.
 * @param subPath - restrict to this repository-relative subtree, '' for all.
 * @returns the discovered skills, shallowest first then alphabetical.
 */
export function findSkills(tree: readonly TreeEntry[], subPath = ''): DiscoveredSkill[] {
  const prefix = subPath === '' ? '' : `${subPath.replace(/\/+$/, '')}/`
  const found: DiscoveredSkill[] = []
  const seen = new Set<string>()

  for (const entry of tree) {
    if (entry.type !== 'blob') continue
    if (!entry.path.startsWith(prefix)) continue
    if (!entry.path.endsWith(`/${SKILL_FILE}`) && entry.path !== SKILL_FILE) continue

    const dir = entry.path === SKILL_FILE ? '' : entry.path.slice(0, -(SKILL_FILE.length + 1))
    // Stay inside the requested subtree: a directory equal to the prefix root
    // itself is valid only when the caller asked for the whole repository.
    if (prefix !== '' && dir !== '' && !dir.startsWith(prefix.replace(/\/$/, ''))) continue
    if (seen.has(dir)) continue
    seen.add(dir)
    const segments = dir === '' ? [] : dir.split('/')
    found.push({ dir, name: segments.length === 0 ? entry.path : segments[segments.length - 1], file: entry })
  }

  return found.sort((left, right) => {
    const depth = left.dir.split('/').length - right.dir.split('/').length
    if (depth !== 0) return depth
    return left.dir.localeCompare(right.dir)
  })
}

/**
 * List one directory's entries through the Contents API.
 *
 * Used for a skill's own file listing, where a recursive tree would be
 * wasteful; falls back to the tree when the Contents API is rate-limited.
 *
 * @param origin - repository coordinates including the skill directory.
 * @param ctx - fetchers and signal.
 * @returns the entries, or an empty array when the directory is gone.
 */
export async function listDir(origin: GitHubOrigin, ctx: MarketSourceContext): Promise<ContentsEntry[]> {
  const path = origin.dir === '' ? '' : `/${origin.dir}`
  const url = `https://api.github.com/repos/${encodeURIComponent(origin.owner)}/${encodeURIComponent(origin.repo)}`
    + `/contents${path}?ref=${encodeURIComponent(origin.ref)}`
  try {
    const payload = await ctx.fetchJson<ContentsEntry[] | ContentsEntry>(url, {
      signal: ctx.signal,
      timeoutMs: 20_000,
      maxBytes: 2 * 1024 * 1024,
    })
    if (!Array.isArray(payload)) return []
    return payload.filter(entry => entry.type === 'file')
  } catch (error) {
    if (error instanceof MarketFetchError && error.code === 'status' && error.status === 404) return []
    throw error
  }
}

/**
 * Build the raw URL for one file in a repository.
 *
 * Raw content is what the accelerator chain carries, and it costs none of the
 * 60/hour API budget.
 *
 * @param origin - repository coordinates.
 * @param relPath - repository-relative file path.
 * @returns the direct raw URL.
 */
export function rawUrl(origin: GitHubOrigin, relPath: string): string {
  const encoded = relPath.split('/').map(encodeURIComponent).join('/')
  return `https://raw.githubusercontent.com/${origin.owner}/${origin.repo}/${encodeURIComponent(origin.ref)}/${encoded}`
}

/**
 * Read one raw file through the accelerator chain.
 * @param origin - repository coordinates.
 * @param relPath - repository-relative file path.
 * @param ctx - proxy chain and signal.
 * @returns the file text.
 */
export async function readRawFile(origin: GitHubOrigin, relPath: string, ctx: MarketSourceContext): Promise<string> {
  return ctx.fetchText(rawUrl(origin, relPath), {
    signal: ctx.signal,
    timeoutMs: 25_000,
    maxBytes: RAW_FILE_MAX_BYTES,
  })
}

/**
 * Parse an `owner/repo` or `owner/repo/sub/dir` coordinate, tolerating a full
 * GitHub URL and an optional `.git` suffix.
 *
 * @param input - user input.
 * @returns the parsed coordinate, or undefined when it is not a repository.
 */
export function parseRepoInput(input: string): { owner: string; repo: string; dir: string } | undefined {
  let text = input.trim()
  if (text === '') return undefined
  // Accept a full URL and a trailing .git so a pasted clone URL works.
  const urlMatch = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i.exec(text)
  if (urlMatch !== null) text = urlMatch[1]
  text = text.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '')
  if (text.includes('..')) return undefined

  const segments = text.split('/').filter(segment => segment !== '')
  if (segments.length < 2) return undefined
  const [owner, repo, ...rest] = segments
  const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) return undefined
  for (const segment of rest) {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(segment)) return undefined
  }
  return { owner, repo, dir: rest.join('/') }
}
