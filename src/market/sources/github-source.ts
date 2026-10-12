/**
 * The `github` source: browse the skills inside a repository the user named.
 *
 * This is what makes *any* public skills repository browsable, not only those a
 * registry indexes. The user types `owner/repo` (a full GitHub URL or a
 * trailing `.git` are also accepted) and the source enumerates its skill
 * directories and reads their bodies.
 *
 * The API budget rule drives the shape: one recursive tree request lists a
 * whole repository, so browsing costs a single call per repository per half
 * hour, and every file body is then read from raw content, which does not
 * touch the budget at all.
 *
 * @module @wulongxi/dsh-skills-hub/market/sources/github-source
 */

import { MarketFetchError } from '../fetch.ts'
import {
  defaultBranch,
  findSkills,
  listRepoTree,
  parseRepoInput,
  readRawFile,
  SKILL_FILE,
} from './github.ts'
import { parseFrontmatter, stripFrontmatter } from '../../core/frontmatter.ts'
import { encodeSkillId } from '../skill-id.ts'
import { listSkillFiles } from './skills-sh.ts'
import type { MarketDetail, MarketSkill, MarketSource, MarketSourceContext } from '../types.ts'

/**
 * Enumerate the skills of one repository.
 * @param coordinates - user input naming the repository.
 * @param ctx - fetchers.
 * @returns the rows, or undefined when the input is not a repository name.
 */
async function enumerate(coordinates: string, ctx: MarketSourceContext): Promise<MarketSkill[] | undefined> {
  const parsed = parseRepoInput(coordinates)
  if (parsed === undefined) return undefined
  const { owner, repo, dir } = parsed

  const base = { kind: 'github' as const, owner, repo, ref: '', dir: '' }
  const ref = await defaultBranch(owner, repo, ctx)

  const tree = await listRepoTree({ ...base, ref }, ctx)
  if (tree === undefined) {
    // A repository the user typed that does not exist, or a name that is not a
    // repository, is a normal answer: the panel shows no rows rather than a 500.
    return []
  }
  // When the user scoped the input to a sub-directory, only that subtree is
  // enumerated; a bare `owner/repo` lists every skill in the repository.
  const discovered = findSkills(tree, dir)
  const seen = new Set<string>()
  const rows: MarketSkill[] = []
  for (const skill of discovered) {
    const origin = { kind: 'github' as const, owner, repo, ref, dir: skill.dir }
    const id = encodeSkillId('github', origin)
    if (seen.has(id)) continue
    seen.add(id)
    rows.push({
      id,
      name: skill.name,
      description: '',
      provider: 'github',
      sourceLabel: `${owner}/${repo}`,
      origin,
    })
  }
  return rows
}

/** The github source. */
export const githubSource: MarketSource = {
  name: 'github',
  // A repository has no queryable index: it is browsed whole, so the source
  // contributes rows only through listRepo.
  searchable: false,
  // Nothing to page: a repository's tree arrives in one request.
  pageable: false,

  async search() {
    return { rows: [], hasMore: false }
  },

  async detail(skill, ctx) {
    // A registry-hosted row cannot come from this source; a defensive guard,
    // since the id decoder already dispatches by provider.
    if (skill.origin.kind !== 'github') return undefined
    let origin = skill.origin

    if (origin.dir === '') {
      // A root-level origin cannot be a directory of files: a skill always
      // lives in a directory, so this row was never resolved. Without a tree
      // request there is no way to know where its SKILL.md sits, and guessing
      // paths against raw content would spray requests for nothing.
      const tree = await listRepoTree(origin, ctx)
      if (tree === undefined) return undefined
      const candidates = findSkills(tree).filter(entry => entry.name.toLowerCase() === skill.name.toLowerCase())
      const match = candidates[0]
      if (match === undefined) return undefined
      origin = { ...origin, dir: match.dir }
      skill = { ...skill, origin }
    }
    const relPath = origin.dir === '' ? SKILL_FILE : `${origin.dir}/${SKILL_FILE}`
    let raw: string
    try {
      raw = await readRawFile(origin, relPath, ctx)
    } catch (error) {
      if (error instanceof MarketFetchError && error.code === 'status' && error.status === 404) return undefined
      throw error
    }
    const frontmatter = parseFrontmatter(raw)
    const files = await listSkillFiles(skill, ctx)
    return {
      skill: {
        ...skill,
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
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    }
  },

  async listRepo(coordinates, ctx) {
    const rows = await enumerate(coordinates, ctx)
    return rows ?? []
  },
}
