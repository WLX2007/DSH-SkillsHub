/**
 * Skill list filtering: the query and workspace predicates the skills tab
 * applies to a host payload.
 *
 * Kept as pure functions so the filter semantics are unit-testable without a
 * DOM: name matches rank before description matches, so typing a skill's name
 * surfaces it first.
 *
 * @module @wulongxi/dsh-skills-hub/client/skill-filter
 */

import type { GroupPayload, SkillEntry } from './api.ts'

/** Filter state the skills tab holds. */
export interface SkillFilter {
  /** Selected workspace root, or 'all'. */
  workspace: string
  /** Free-text query (matched against name and description). */
  query: string
}

/** Whether a row belongs to the selected workspace. */
function inWorkspace(skill: SkillEntry, workspace: string): boolean {
  if (workspace === 'all') return true
  return skill.workspaceRoot === workspace
}

/**
 * Whether a row matches the query.
 *
 * A row without a workspace (user / bundled / runtime skills) stays visible
 * under every workspace selection: it is not scoped to one project, so hiding
 * it would make globally available skills disappear when a project is picked.
 *
 * @param skill - the row.
 * @param query - the trimmed, lowercased query.
 * @returns whether the row passes the text filter.
 */
function matchesQuery(skill: SkillEntry, query: string): boolean {
  if (query === '') return true
  return skill.name.toLowerCase().includes(query)
    || skill.description.toLowerCase().includes(query)
    || (skill.whenToUse ?? '').toLowerCase().includes(query)
}

/**
 * Apply the filter to one group's skills.
 * @param skills - the group's rows.
 * @param filter - workspace + query.
 * @returns the surviving rows, name matches first.
 */
export function selectSkills(skills: readonly SkillEntry[], filter: SkillFilter): SkillEntry[] {
  const query = filter.query.trim().toLowerCase()
  const survivors = skills.filter(skill =>
    (skill.workspaceRoot === undefined || inWorkspace(skill, filter.workspace))
    && matchesQuery(skill, query),
  )
  if (query === '') return survivors
  // Name matches first: a user typing a skill's name expects it at the top.
  return [...survivors].sort((left, right) => {
    const leftName = left.name.toLowerCase().includes(query) ? 0 : 1
    const rightName = right.name.toLowerCase().includes(query) ? 0 : 1
    if (leftName !== rightName) return leftName - rightName
    return left.name.localeCompare(right.name)
  })
}

/**
 * Apply the filter across every group, dropping groups that empty out.
 * @param groups - the host payload's groups.
 * @param filter - workspace + query.
 * @returns the visible groups.
 */
export function selectGroups(groups: readonly GroupPayload[], filter: SkillFilter): GroupPayload[] {
  return groups
    .map(group => ({ ...group, skills: selectSkills(group.skills, filter) }))
    .filter(group => group.skills.length > 0)
}
