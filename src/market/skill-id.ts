/**
 * Market skill ids.
 *
 * The client never sends a URL, a repository, or a path: it sends back the
 * opaque id the host handed it, and the host re-derives the coordinates. That
 * is what keeps a hostile payload from pointing the installer at an arbitrary
 * repository — the same rule the write routes already follow for file paths.
 *
 * Form: `<provider>:<owner>/<repo>@<ref>:<dir>`
 *   - `owner/repo` — GitHub coordinates, each segment already constrained by
 *     the grammar below, so the whole id is a fixed shape rather than free text;
 *   - `@<ref>` — branch, tag or commit;
 *   - `:<dir>` — the skill's directory inside the repository, `''` for root.
 *
 * @module @wulongxi/dsh-skills-hub/market/skill-id
 */

import type { MarketOrigin, MarketSkill } from './types.ts'

/** GitHub owner/repo segment grammar (no slashes, no dots-only tricks). */
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

/** A ref may additionally contain slashes (`release/v1`) but no `..`. */
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,199}$/

/** A repository-relative directory: safe segments joined by single slashes. */
const DIR_RE = /^$|^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/

/** Provider ids are short lowercase identifiers. */
const PROVIDER_RE = /^[a-z0-9][a-z0-9-]{0,31}$/

/**
 * Whether a value is a usable GitHub owner or repository segment.
 * @param value - candidate.
 * @returns whether it matches the grammar.
 */
export function isRepoSegment(value: string): boolean {
  return SEGMENT_RE.test(value)
}

/**
 * Whether a value is a usable git ref.
 * @param value - candidate.
 * @returns whether it matches the grammar and cannot escape upward.
 */
export function isRef(value: string): boolean {
  return REF_RE.test(value) && !value.includes('..')
}

/**
 * Whether a value is a safe repository-relative directory.
 * @param value - candidate ('' is valid and means the repository root).
 * @returns whether it matches the grammar and cannot escape upward.
 */
export function isRepoDir(value: string): boolean {
  return DIR_RE.test(value) && !value.includes('..') && !value.includes('//')
}

/**
 * Build the opaque id for one skill.
 * @param provider - the source that produced it.
 * @param origin - its repository coordinates.
 * @returns the id.
 */
export function encodeSkillId(provider: string, origin: MarketOrigin): string {
  return `${provider}:${origin.owner}/${origin.repo}@${origin.ref}:${origin.dir}`
}

/** One decoded id. */
export interface DecodedSkillId {
  provider: string
  origin: MarketOrigin
}

/**
 * Parse an id back into provider and coordinates.
 *
 * Every part is validated, so a malformed or hostile id is rejected here rather
 * than reaching a fetch. This is the only place a client-supplied id becomes
 * repository coordinates.
 *
 * @param id - the opaque id from the client.
 * @returns the decoded parts, or undefined when the id is not well formed.
 */
export function decodeSkillId(id: string): DecodedSkillId | undefined {
  const colon = id.indexOf(':')
  if (colon <= 0) return undefined
  const provider = id.slice(0, colon)
  if (!PROVIDER_RE.test(provider)) return undefined

  const rest = id.slice(colon + 1)
  const at = rest.lastIndexOf('@')
  if (at <= 0) return undefined
  const repoPath = rest.slice(0, at)
  const tail = rest.slice(at + 1)

  // The ref may itself contain slashes, so the directory separator is the LAST
  // colon: everything before it is the ref, everything after is the directory.
  const dirColon = tail.indexOf(':')
  if (dirColon < 0) return undefined
  const ref = tail.slice(0, dirColon)
  const dir = tail.slice(dirColon + 1)

  if (!isRef(ref)) return undefined
  if (!isRepoDir(dir)) return undefined

  const slash = repoPath.indexOf('/')
  if (slash <= 0) return undefined
  const owner = repoPath.slice(0, slash)
  const repo = repoPath.slice(slash + 1)
  if (!isRepoSegment(owner) || !isRepoSegment(repo)) return undefined

  return { provider, origin: { kind: 'github', owner, repo, ref, dir } }
}

/**
 * Normalise an id for comparison: providers may report the same repository at
 * different refs, and a de-duplicated list should not show a skill twice.
 * @param skill - the row.
 * @returns a stable identity key.
 */
export function skillIdentity(skill: MarketSkill): string {
  const { origin } = skill
  return `${origin.owner}/${origin.repo}:${origin.dir}`.toLowerCase()
}
