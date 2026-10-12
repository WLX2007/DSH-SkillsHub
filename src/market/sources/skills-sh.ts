/**
 * The skills.sh source: the Agent Skills registry's search.
 *
 * Measured shape of `GET https://skills.sh/api/search?q=<q>&limit=<n>`:
 *
 * ```json
 * { "count": 50,
 *   "skills": [{ "id": "anthropics/skills/pdf", "source": "anthropics/skills",
 *                "skillId": "pdf", "name": "pdf", "installs": 209208 }] }
 * ```
 *
 * Two limits are deliberate:
 *
 *  - **Search only.** The registry serves `/api/search` as JSON but every other
 *    path as an HTML page (`/api/skills/pdf` answers `text/html`), so a skill's
 *    body is resolved from its GitHub repository instead of scraped.
 *  - **No description.** The search response carries none, so rows arrive with
 *    an empty description and the panel fills it in when the user opens the
 *    skill. Fetching every hit's SKILL.md to decorate a list would cost one raw
 *    request per row for text the user has not asked to see.
 *
 * @module @wulongxi/dsh-skills-hub/market/sources/skills-sh
 */

import { MarketFetchError } from '../fetch.ts'
import { findSkills, listRepoTree, readRawFile, SKILL_FILE } from './github.ts'
import { parseFrontmatter, stripFrontmatter } from '../../core/frontmatter.ts'
import { encodeSkillId } from '../skill-id.ts'
import type { MarketDetail, MarketSkill, MarketSource, MarketSourceContext } from '../types.ts'

/** The registry's search endpoint. */
export const SKILLS_SH_SEARCH = 'https://skills.sh/api/search'

/**
 * The ref used for registry hits.
 *
 * `HEAD` resolves to a repository's default branch at fetch time, so one ref is
 * correct for every hit on a page even though a search spans many repositories
 * with different default branches (`main`, `master`, …). It is also why search
 * costs no GitHub API budget: the alternative — asking each repository for its
 * default branch — would burn one of the 60 hourly calls per row.
 *
 * Verified against raw.githubusercontent.com through the accelerator chain:
 * `.../anthropics/skills/HEAD/skills/pdf/SKILL.md` returns the file.
 */
export const REGISTRY_REF = 'HEAD'

/** One row of the search response. */
interface SearchHit {
  /** `<owner>/<repo>/<skillId>`. */
  id?: unknown
  /** `<owner>/<repo>`. */
  source?: unknown
  /** The skill's directory basename, not its path. */
  skillId?: unknown
  name?: unknown
  installs?: unknown
}

/** The search response envelope. */
interface SearchResponse {
  skills?: unknown
  count?: unknown
}

/**
 * Build the registry search URL.
 * @param query - free text.
 * @param limit - maximum rows.
 * @returns the absolute URL.
 */
export function searchUrl(query: string, limit: number): string {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return `${SKILLS_SH_SEARCH}?${params.toString()}`
}

/**
 * Turn one registry hit into a normalised row.
 *
 * The registry reports `skillId` (a basename) but not the skill's directory, so
 * the origin starts at the repository root and {@link resolveOrigin} narrows it
 * to the real directory on demand. That keeps a search cheap: no tree request
 * per hit.
 *
 * @param hit - one raw row.
 * @param ref - the ref the repository's files will be read at.
 * @returns the row, or undefined when the hit is malformed.
 */
function toMarketSkill(hit: SearchHit, ref: string): MarketSkill | undefined {
  const source = typeof hit.source === 'string' ? hit.source : undefined
  const skillId = typeof hit.skillId === 'string' ? hit.skillId : undefined
  const name = typeof hit.name === 'string' ? hit.name : skillId
  if (source === undefined || name === undefined || name === '') return undefined

  const slash = source.indexOf('/')
  if (slash <= 0) return undefined
  const owner = source.slice(0, slash)
  const repo = source.slice(slash + 1)
  if (owner === '' || repo === '') return undefined

  const origin = { kind: 'github' as const, owner, repo, ref, dir: '' }
  const installs = typeof hit.installs === 'number' && Number.isFinite(hit.installs) ? hit.installs : undefined

  return {
    id: encodeSkillId('skills-sh', origin),
    name,
    // Filled in from the skill's own frontmatter when the user opens it.
    description: '',
    provider: 'skills-sh',
    sourceLabel: source,
    origin,
    ...(installs === undefined ? {} : { installs }),
  }
}

/**
 * Narrow a repository-root origin down to the directory actually holding a
 * skill's SKILL.md.
 *
 * A registry hit names the skill but not its path (`skills/pdf` vs `pdf`), so
 * the directory is discovered from the repository tree. When a repository holds
 * several skills of the same basename the shallowest wins, which is the one a
 * registry most plausibly indexed.
 *
 * @param skill - the row whose origin should be narrowed.
 * @param ctx - fetchers.
 * @returns a row whose origin points at the skill directory, or the input when
 *   the tree cannot be read.
 */
export async function resolveOrigin(skill: MarketSkill, ctx: MarketSourceContext): Promise<MarketSkill> {
  // This source mints GitHub origins only; a foreign kind cannot be narrowed.
  if (skill.origin.kind !== 'github') return skill
  let origin = skill.origin
  const tree = await listRepoTree(origin, ctx)
  if (tree === undefined) return skill
  const candidates = findSkills(tree).filter(entry => entry.name.toLowerCase() === skill.name.toLowerCase())
  const match = candidates[0]
  if (match === undefined) return skill
  origin = { ...origin, dir: match.dir }
  return { ...skill, origin, id: encodeSkillId(skill.provider, origin) }
}

/**
 * Read one skill's files and body from its repository.
 * @param skill - the row, with an origin already narrowed by {@link resolveOrigin}.
 * @param ctx - fetchers.
 * @returns the detail, or undefined when the skill has no readable SKILL.md.
 */
export async function readDetail(skill: MarketSkill, ctx: MarketSourceContext): Promise<MarketDetail | undefined> {
  if (skill.origin.kind !== 'github') return undefined
  const origin = skill.origin
  const relPath = origin.dir === '' ? SKILL_FILE : `${origin.dir}/${SKILL_FILE}`
  let raw: string
  try {
    raw = await readRawFile(origin, relPath, ctx)
  } catch {
    // A missing or unreadable SKILL.md means this is not a readable skill:
    // a normal answer for a stale registry hit, not an internal failure.
    return undefined
  }

  const frontmatter = parseFrontmatter(raw)
  const files = await listSkillFiles(skill, ctx)
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)

  return {
    skill: {
      ...skill,
      // The file is authoritative over the registry row for both fields.
      name: frontmatter.name ?? skill.name,
      description: frontmatter.description ?? skill.description,
    },
    body: stripFrontmatter(raw).trim(),
    frontmatter: {
      ...(frontmatter.name === undefined ? {} : { name: frontmatter.name }),
      ...(frontmatter.description === undefined ? {} : { description: frontmatter.description }),
      ...(frontmatter.whenToUse === undefined ? {} : { whenToUse: frontmatter.whenToUse }),
    },
    files,
    totalBytes,
  }
}

/**
 * List the files inside a skill's directory from the repository tree.
 *
 * Uses the recursive tree (one API request, already cached) rather than the
 * Contents API, so a detail view costs no extra API budget.
 *
 * @param skill - the row with a resolved origin.
 * @param ctx - fetchers.
 * @returns the files, or a single SKILL.md entry when the tree is unavailable.
 */
export async function listSkillFiles(
  skill: MarketSkill,
  ctx: MarketSourceContext,
): Promise<Array<{ path: string; size: number }>> {
  if (skill.origin.kind !== 'github') return []
  const tree = await listRepoTree(skill.origin, ctx)
  if (tree === undefined) return []
  const prefix = skill.origin.dir === '' ? '' : `${skill.origin.dir}/`
  return tree
    .filter(entry => entry.type === 'blob' && entry.path.startsWith(prefix))
    .map(entry => ({
      path: entry.path.slice(prefix.length),
      size: entry.size ?? 0,
    }))
    .filter(file => file.path !== '')
    .sort((left, right) => left.path.localeCompare(right.path))
}

/** The skills.sh source. */
export const skillsShSource: MarketSource = {
  name: 'skills-sh',
  searchable: true,

  async search(query, limit, ctx) {
    const wasEmpty = query.trim() === ''
    // The registry has no "list everything" mode; an empty query would return
    // its own unfiltered page, so an empty search is answered with nothing
    // rather than a surprise dump.
    if (wasEmpty) return []

    const payload = await ctx.fetchJson<SearchResponse>(searchUrl(query.trim(), limit), {
      signal: ctx.signal,
      timeoutMs: 20_000,
      maxBytes: 2 * 1024 * 1024,
    })
    if (!Array.isArray(payload?.skills)) {
      throw new MarketFetchError('parse', 'skills.sh search answer had no skills array')
    }

    const rows: MarketSkill[] = []
    const seen = new Set<string>()
    for (const hit of payload.skills) {
      if (rows.length >= limit) break
      const row = toMarketSkill(hit as SearchHit, REGISTRY_REF)
      if (row === undefined) continue
      const key = `${row.sourceLabel}/${row.name}`.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
    return rows
  },

  async detail(skill, ctx) {
    // A registry row starts at the repository root, so the directory must be
    // resolved before the files can be read. A non-GitHub origin cannot come
    // from this source at all.
    if (skill.origin.kind !== 'github') return undefined
    const resolved = skill.origin.dir === '' && skill.provider === 'skills-sh'
      ? await resolveOrigin(skill, ctx)
      : skill
    return readDetail(resolved, ctx)
  },
}

