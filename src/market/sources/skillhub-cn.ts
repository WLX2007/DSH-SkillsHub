/**
 * The SkillHub (skillhub.cn) source: a China-hosted Agent Skills registry.
 *
 * This source is integrated on the strength of three verifiable facts, each
 * checked rather than assumed:
 *
 *  1. **It invites agent access.** The site publishes
 *     `https://skillhub.cn/install/skillhub.md` — an integration document
 *     written *for* agents, opening "SkillHub 是国内优先的 Skill 商店，提供加速、
 *     合规的技能搜索与安装能力。优先策略已内联，Agent 读取本文档即感知" — and
 *     its robots.txt allows every user-agent. Programmatic search is the
 *     intended use, not tolerated use.
 *  2. **No authentication anywhere on the read path.** Search, skill metadata,
 *     the file manifest and every file body answer plainly; twelve rapid
 *     consecutive calls all succeeded.
 *  3. **It is the default source** because it is reachable from this network
 *     without a proxy, which the GitHub-backed sources are not.
 *
 * Endpoints (all under https://api.skillhub.cn, verified):
 *
 *   GET /api/skills?page=&pageSize=&sortBy=&keyword=   → { code: 0, data: { skills, total } }
 *   GET /api/v1/skills/{slug}                          → { skill: { … } }
 *   GET /api/v1/skills/{slug}/files                    → { count, files: [{ path, sha256, size }] }
 *   GET /api/v1/skills/{slug}/file?path=<rel>          → the file body verbatim
 *
 * Licensing is surfaced, not laundered: a skill's own SKILL.md frontmatter may
 * declare a licence (`license: MIT`, `license: GPL-3.0-or-later`, …), and a
 * sample of the catalogue found roughly half the entries declare none. The row
 * therefore carries a `licence` field that says either what is declared or that
 * nothing was — the panel shows it, because an undeclared licence is exactly
 * the fact a user needs before copying a skill to disk.
 *
 * @module @wulongxi/dsh-skills-hub/market/sources/skillhub-cn
 */

import { MarketFetchError } from '../fetch.ts'
import { parseFrontmatter, stripFrontmatter } from '../../core/frontmatter.ts'
import { encodeSkillId, isRepoSegment } from '../skill-id.ts'
import type {
  MarketDetail,
  MarketFile,
  MarketLicence,
  MarketSkill,
  MarketSource,
  MarketSourceContext,
} from '../types.ts'

/** The registry's API base. */
export const SKILLHUB_API_BASE = 'https://api.skillhub.cn'

/** The listing endpoint. */
export const SKILLHUB_LIST_URL = `${SKILLHUB_API_BASE}/api/skills`

/** A safe slug: what the registry generates and what we accept back. */
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,119}$/

/** Cap on a file body, generous for a SKILL.md but bounded all the same. */
const FILE_MAX_BYTES = 2 * 1024 * 1024

/** Cap on a listing page. */
const LIST_MAX_BYTES = 4 * 1024 * 1024

/** One row of the listing response. */
interface ListRow {
  slug?: unknown
  name?: unknown
  description?: unknown
  description_zh?: unknown
  downloads?: unknown
  installs?: unknown
  stars?: unknown
  score?: unknown
  verified?: unknown
  source?: unknown
}

/** The listing envelope. */
interface ListResponse {
  code?: unknown
  data?: { skills?: unknown; total?: unknown }
  message?: unknown
}

/** The detail envelope. */
interface DetailResponse {
  skill?: { slug?: unknown; name?: unknown; displayName?: unknown; summary?: unknown; source?: unknown }
}

/** The file-manifest envelope. */
interface FilesResponse {
  count?: unknown
  files?: unknown
}

/**
 * Whether a value is a usable registry slug.
 * @param value - candidate.
 * @returns whether it matches the grammar.
 */
export function isSlug(value: string): boolean {
  return SLUG_RE.test(value)
}

/**
 * Build the listing URL.
 * @param query - free text; empty lists the ranking.
 * @param page - one-based page number.
 * @param pageSize - rows per page.
 * @returns the absolute URL.
 */
export function listUrl(query: string, page: number, pageSize: number): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  // A score sort is the registry's own relevance ranking and what the site's
  // default view uses; keyword narrows it.
  params.set('sortBy', 'score')
  const text = query.trim()
  if (text !== '') params.set('keyword', text)
  return `${SKILLHUB_LIST_URL}?${params.toString()}`
}

/**
 * Read the licence out of a SKILL.md frontmatter.
 *
 * The field is optional in the Agent Skills grammar and roughly half the
 * catalogue omits it; both facts are reported rather than silently normalised
 * to some default, because the difference is what a user needs to know before
 * copying a skill to disk.
 *
 * The field is read from the raw frontmatter block rather than the shared
 * parser: `parseFrontmatter` models exactly the fields the local panel rewrites,
 * and adding a market-only field to it would widen that contract for no local
 * benefit. A line-scoped match is enough here — the value is a bare scalar in
 * every observed skill, and a quoted or commented edge case degrades to
 * "undeclared", which errs on the side of telling the user less than it knows.
 *
 * @param frontmatterText - the raw SKILL.md text.
 * @returns what the skill declares, or that it declares nothing.
 */
export function licenceOf(frontmatterText: string): MarketLicence {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(frontmatterText)
  if (block === null) return { state: 'undeclared' }
  const match = /^license:\s*(.+)$/m.exec(block[1])
  if (match === null) return { state: 'undeclared' }
  const licence = match[1].trim().replace(/^["']|["']$/g, '')
  if (licence === '') return { state: 'undeclared' }
  return { state: 'declared', licence }
}

/**
 * Normalise one listing row.
 * @param row - raw registry row.
 * @returns a normalised row, or undefined when the entry is malformed.
 */
function toMarketSkill(row: ListRow): MarketSkill | undefined {
  const slug = typeof row.slug === 'string' ? row.slug : undefined
  if (slug === undefined || !isSlug(slug)) return undefined
  const name = typeof row.name === 'string' && row.name !== '' ? row.name : slug
  // The registry carries both an English and a Chinese description; prefer
  // whichever is non-empty, Chinese first because this source's users read it.
  const description =
    (typeof row.description_zh === 'string' && row.description_zh.trim() !== '' ? row.description_zh : undefined)
    ?? (typeof row.description === 'string' ? row.description : '')
  const downloads = typeof row.downloads === 'number' && Number.isFinite(row.downloads) ? row.downloads : undefined

  return {
    id: encodeSkillId('skillhub', { kind: 'skillhub', slug }),
    name,
    description,
    provider: 'skillhub',
    sourceLabel: 'skillhub.cn',
    origin: { kind: 'skillhub', slug },
    ...(downloads === undefined ? {} : { installs: downloads }),
  }
}

/**
 * Read a skill's file manifest and its SKILL.md body.
 * @param slug - the skill's slug.
 * @param ctx - fetchers.
 * @returns the detail parts, or undefined when the skill has no SKILL.md.
 */
async function readDetailParts(
  slug: string,
  ctx: MarketSourceContext,
): Promise<{ body: string; frontmatter: { name?: string; description?: string; whenToUse?: string }; files: MarketFile[]; licence: MarketLicence } | undefined> {
  const manifest = await ctx.fetchJson<FilesResponse>(`${SKILLHUB_API_BASE}/api/v1/skills/${encodeURIComponent(slug)}/files`, {
    signal: ctx.signal,
    timeoutMs: 20_000,
    maxBytes: 2 * 1024 * 1024,
  })
  if (!Array.isArray(manifest?.files)) return undefined

  const files: MarketFile[] = manifest.files
    .filter((entry): entry is { path: unknown; size: unknown } => typeof entry === 'object' && entry !== null)
    .map(entry => ({
      path: typeof (entry as { path?: unknown }).path === 'string' ? String((entry as { path?: unknown }).path) : '',
      size: typeof (entry as { size?: unknown }).size === 'number' ? Number((entry as { size?: unknown }).size) : 0,
    }))
    .filter(file => file.path !== '')

  let raw: string
  try {
    raw = await ctx.fetchText(`${SKILLHUB_API_BASE}/api/v1/skills/${encodeURIComponent(slug)}/file?path=${encodeURIComponent('SKILL.md')}`, {
      signal: ctx.signal,
      timeoutMs: 20_000,
      maxBytes: FILE_MAX_BYTES,
    })
  } catch {
    // A manifest without a SKILL.md is not a skill this panel can preview.
    return undefined
  }

  const frontmatter = parseFrontmatter(raw)
  return {
    body: stripFrontmatter(raw).trim(),
    frontmatter: {
      ...(frontmatter.name === undefined ? {} : { name: frontmatter.name }),
      ...(frontmatter.description === undefined ? {} : { description: frontmatter.description }),
      ...(frontmatter.whenToUse === undefined ? {} : { whenToUse: frontmatter.whenToUse }),
    },
    files,
    licence: licenceOf(raw),
  }
}

/** The SkillHub source. */
export const skillhubSource: MarketSource = {
  name: 'skillhub',
  searchable: true,
  // The registry pages natively (page + pageSize + total), so "load more" is a
  // real capability here.
  pageable: true,

  async search(query, limit, ctx, page = 1) {
    const pageSize = Math.min(Math.max(limit, 1), 50)
    const payload = await ctx.fetchJson<ListResponse>(listUrl(query, page, pageSize), {
      signal: ctx.signal,
      timeoutMs: 20_000,
      maxBytes: LIST_MAX_BYTES,
    })
    // The registry answers { code: 0, data: { skills } }; a non-zero code is
    // its own error channel and must surface as one, not as an empty page.
    if (payload?.code !== 0) {
      const message = typeof payload?.message === 'string' ? payload.message : `code ${String(payload?.code)}`
      throw new MarketFetchError('parse', `skillhub.cn listing failed: ${message}`)
    }
    if (!Array.isArray(payload.data?.skills)) {
      throw new MarketFetchError('parse', 'skillhub.cn listing answer had no skills array')
    }

    const rows: MarketSkill[] = []
    for (const row of payload.data.skills as ListRow[]) {
      if (rows.length >= limit) break
      const normalised = toMarketSkill(row)
      if (normalised !== undefined) rows.push(normalised)
    }
    // The registry reports a total for the query, so "is there a next page" is
    // a fact rather than a guess about the row count.
    const total = typeof payload.data.total === 'number' ? payload.data.total : undefined
    const servedUpTo = (page - 1) * pageSize + rows.length
    return {
      rows,
      hasMore: total === undefined ? rows.length >= pageSize : servedUpTo < total,
      ...(total === undefined ? {} : { total }),
    }
  },

  async detail(skill, ctx) {
    if (skill.origin.kind !== 'skillhub') return undefined
    const slug = skill.origin.slug

    const parts = await readDetailParts(slug, ctx)
    if (parts === undefined) return undefined

    // The registry's own metadata fills the row in; the file is authoritative
    // for the name, as it is for every source.
    let description = skill.description
    try {
      const meta = await ctx.fetchJson<DetailResponse>(
        `${SKILLHUB_API_BASE}/api/v1/skills/${encodeURIComponent(slug)}`,
        { signal: ctx.signal, timeoutMs: 15_000, maxBytes: 512 * 1024 },
      )
      const summary = meta?.skill?.summary
      if (typeof summary === 'string' && summary.trim() !== '' && description === '') {
        description = summary.trim()
      }
    } catch {
      // Metadata is decoration: the body alone still answers the request.
    }

    return {
      skill: {
        ...skill,
        name: parts.frontmatter.name ?? skill.name,
        description: parts.frontmatter.description ?? description,
        licence: parts.licence,
      },
      body: parts.body,
      frontmatter: parts.frontmatter,
      files: parts.files,
      totalBytes: parts.files.reduce((sum, file) => sum + file.size, 0),
    }
  },
}

/**
 * Re-exported so the shared id decoder can be kept next to the sources that
 * mint ids; the registry module imports this module's slug check transitively.
 * @param value - candidate segment.
 * @returns whether it matches the grammar.
 */
export function isValidSegment(value: string): boolean {
  return isRepoSegment(value)
}
