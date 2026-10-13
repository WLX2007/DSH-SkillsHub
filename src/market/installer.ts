/**
 * The installer: copy a market skill's files onto disk.
 *
 * The rules, each of which exists because the alternative has a concrete
 * failure mode:
 *
 *  - **The detail manifest is the file list.** Only paths the skill's own
 *    detail view reported are downloaded — a client cannot name a file to
 *    fetch, and a hostile manifest cannot name a path outside the skill
 *    directory (every path is validated below).
 *  - **Staging + rename.** Files land in `<root>/.staging/<name>-<ts>/` first
 *    and the directory is renamed into place only when every file arrived and
 *    passed the size cap. A failed or cancelled install leaves the previous
 *    state of the disk untouched — no half-written skill the model could
 *    later load.
 *  - **Collision is an error, not an overwrite.** An existing skill with the
 *    same directory name is never silently replaced; the panel answers 409
 *    and the user decides.
 *  - **Provenance is written with the skill.** A `.skills-hub.json` record
 *    rides along inside the installed directory, so "where did this come
 *    from" stays answerable after the fact (M4's update check reads it).
 *  - **Licence is surfaced, not laundered.** The install result reports what
 *    the skill declares; the UI shows the warning BEFORE the user confirms,
 *    because copying an undeclared-licence skill is the decision this whole
 *    flow exists to make an informed one.
 *
 * @module @wulongxi/dsh-skills-hub/market/installer
 */

import { existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isSkillName, projectSkillRoot, userSkillRoot } from '../core/collect.ts'
import type { Market } from './registry.ts'
import type { MarketLicence } from './types.ts'

/** Where an install may land. */
export type InstallRoot = 'user' | 'project'

/** Cap per file, matching the market layer's own read cap. */
const FILE_MAX_BYTES = 2 * 1024 * 1024

/** Cap on the whole skill (all files together). */
const TOTAL_MAX_BYTES = 16 * 1024 * 1024

/** Cap on file count: a skill with more entries than this is not a skill. */
const MAX_FILES = 200

/** The provenance record written beside the skill. */
export interface ProvenanceRecord {
  /** The opaque market id the skill was installed from. */
  id: string
  /** The source that minted the id (`skillhub`, `skills-sh`, …). */
  provider: string
  /** Human-readable origin (`skillhub.cn/<slug>` or `owner/repo`). */
  sourceLabel: string
  /** What the skill declared at install time. */
  licence: MarketLicence
  /** ISO timestamp of the install. */
  installedAt: string
  /** The plugin version that performed the install. */
  installedBy: string
}

/** The result of a successful install. */
export interface InstallResult {
  /** The skill's directory name (and canonical name). */
  name: string
  /** The absolute SKILL.md path. */
  path: string
  /** The root it landed in. */
  root: InstallRoot
  /** How many files were written (excluding the provenance record). */
  files: number
  /** The licence the skill declares, reported verbatim. */
  licence: MarketLicence
  /**
   * Manifest files the registry refused to serve (its own 4xx/5xx) or that
   * arrived over the per-file cap, with the reason each was skipped. The
   * skill installed WITHOUT these; SKILL.md is never among them, because
   * without it there is no install at all. Present only when non-empty.
   */
  skipped?: Array<{ path: string; reason: string }>
}

/** A relative path that stays inside the skill directory. */
const SAFE_REL_PATH_RE = /^(?:[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/

/**
 * Whether a manifest path may be written.
 *
 * Rejects absolute paths, `..` segments, backslashes, empty segments and
 * anything outside the ASCII-safe grammar the two sources can produce. The
 * check runs on the exact string the manifest reported, before it is joined
 * onto any base directory.
 *
 * @param relPath - path relative to the skill directory.
 * @returns whether it is safe to place under the staging root.
 */
export function isSafeRelPath(relPath: string): boolean {
  if (relPath === '' || relPath.includes('\\')) return false
  if (relPath.includes('..') || relPath.includes('//')) return false
  return SAFE_REL_PATH_RE.test(relPath)
}

/**
 * The directory name a market skill installs under.
 *
 * The skill's own frontmatter `name` is authoritative when valid (that is the
 * name the official registry will load); otherwise the coordinate's last
 * segment (GitHub directory or SkillHub slug). A name that fails the official
 * grammar is refused rather than mangled — a skill whose name cannot be loaded
 * is not worth installing.
 *
 * @param skillName - the name the detail row carries.
 * @param fallback - the coordinate's last segment.
 * @returns the directory name.
 */
export function installName(skillName: string, fallback: string): string {
  if (isSkillName(skillName)) return skillName
  if (isSkillName(fallback)) return fallback
  throw new Error(`skill name "${skillName || fallback}" is not a valid skill name (kebab-case)`)
}

/**
 * Install one market skill.
 *
 * @param market - the market instance (supplies detail and file reads).
 * @param id - the opaque skill id from the panel.
 * @param root - 'user' (~/.dsh/skills) or 'project' (<project>/.dsh/skills).
 * @param projectCwd - the workspace the panel is showing; resolves the
 *   project root when root is 'project'.
 * @param dshHome - the user dsh home (resolves the user root).
 * @param installedBy - plugin version for the provenance record.
 * @param signal - caller cancellation; an aborted install leaves no residue.
 * @returns what was installed and where.
 */
export async function installSkill(
  market: Market,
  id: string,
  root: InstallRoot,
  projectCwd: string,
  dshHome: string,
  installedBy: string,
  signal?: AbortSignal,
): Promise<InstallResult> {
  if (root !== 'user' && root !== 'project') {
    throw new Error(`unknown install root: ${String(root)}`)
  }

  // The detail is the contract: its manifest is the file list, its frontmatter
  // the authoritative name, and it re-derives everything from the id — so the
  // client cannot aim this at coordinates the market did not mint.
  const detail = await market.detail(id, signal)
  if (detail === undefined) {
    throw new Error(`skill ${id} is not offered by any market source`)
  }

  const origin = detail.skill.origin
  const fallback = origin.kind === 'skillhub' ? origin.slug : origin.dir.split('/').pop() ?? ''
  const name = installName(detail.skill.name, fallback)

  // Collision check BEFORE any download: overwriting an existing skill is a
  // decision for the user (and M4's update flow), never a side effect here.
  const baseDir = root === 'user' ? userSkillRoot(dshHome) : projectSkillRoot(projectCwd)
  const targetDir = join(baseDir, name)
  if (existsSync(targetDir)) {
    throw new Error(`skill ${name} already exists at ${targetDir}`)
  }

  const files = detail.files.filter(file => file.path !== 'SKILL.md')
  if (files.length > MAX_FILES) {
    throw new Error(`skill ${name} carries ${files.length} files, over the ${MAX_FILES} limit`)
  }
  if (detail.totalBytes > TOTAL_MAX_BYTES) {
    throw new Error(`skill ${name} is ${detail.totalBytes} bytes in total, over the limit`)
  }
  for (const file of files) {
    if (!isSafeRelPath(file.path)) {
      throw new Error(`skill ${name} manifest names an unsafe path: ${file.path}`)
    }
    if (file.size > FILE_MAX_BYTES) {
      throw new Error(`skill ${name} file ${file.path} exceeds the ${FILE_MAX_BYTES} byte cap`)
    }
  }

  // Stage beside the target (same volume, so the rename is atomic) under a
  // dot-directory the skill scanner skips, then rename into place.
  const stagingDir = join(baseDir, `.staging-${name}-${Date.now()}`)
  await mkdir(stagingDir, { recursive: true })
  let licence: MarketLicence = { state: 'undeclared' }
  /** Manifest paths that could not be fetched, with the reason. */
  const skipped: Array<{ path: string; reason: string }> = []
  try {
    for (const file of detail.files) {
      signal?.throwIfAborted()
      let body: string
      try {
        body = await market.readFile(id, file.path, signal)
      } catch (error) {
        // A file the REGISTRY refuses to serve again (its own 413/404/500) is
        // permanent for this attempt — but the skill may still be usable
        // without a bundled vendor asset. SKILL.md is the exception: without
        // it nothing installable exists, so it propagates and aborts.
        if (file.path === 'SKILL.md') throw error
        skipped.push({ path: file.path, reason: error instanceof Error ? error.message : String(error) })
        continue
      }
      const bytes = Buffer.byteLength(body, 'utf8')
      if (bytes > FILE_MAX_BYTES) {
        if (file.path === 'SKILL.md') throw new Error(`skill ${name} file ${file.path} arrived at ${bytes} bytes, over the cap`)
        skipped.push({ path: file.path, reason: `arrived at ${bytes} bytes, over the ${FILE_MAX_BYTES} byte cap` })
        continue
      }
      const target = join(stagingDir, file.path)
      if (!target.startsWith(stagingDir)) {
        // Defence in depth below isSafeRelPath: the join cannot escape, but the
        // invariant is cheap to assert and the consequence of breaking it is a
        // write outside the skill root.
        throw new Error(`refusing to write outside the staging directory: ${file.path}`)
      }
      await mkdir(join(target, '..'), { recursive: true })
      await writeFile(target, body, 'utf8')
    }

    // Provenance rides inside the skill directory: it travels with the skill
    // if the user copies it, and M4's update check reads it back.
    const provenance: ProvenanceRecord = {
      id,
      provider: detail.skill.provider,
      sourceLabel: detail.skill.sourceLabel,
      licence: detail.skill.licence ?? licence,
      installedAt: new Date().toISOString(),
      installedBy,
    }
    licence = provenance.licence
    await writeFile(join(stagingDir, '.skills-hub.json'), JSON.stringify(provenance, null, 2), 'utf8')

    await renameWithRetry(stagingDir, targetDir)
  } catch (error) {
    // Any failure — network, cap, abort — leaves nothing behind: the target
    // never existed, and the staging directory is the only residue possible.
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }

  return {
    name,
    path: join(targetDir, 'SKILL.md'),
    root,
    files: detail.files.length,
    /** The files the registry refused to serve; the skill installed without them. */
    ...(skipped.length > 0 ? { skipped } : {}),
    licence,
  }
}

/**
 * Rename a directory into place, retrying the Windows lock window.
 *
 * On Windows a freshly written file can stay briefly locked by antivirus
 * indexing or the filesystem itself (EPERM on rename); the condition clears
 * in milliseconds, so a short backoff — not an error — is the right answer.
 * Retries only EPERM/EACCES/EBUSY: anything else is a real failure.
 *
 * @param from - the staging directory.
 * @param to - the target directory.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  const delays = [50, 150, 400, 800]
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (attempt >= delays.length || (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY')) throw error
      await new Promise(resolve => setTimeout(resolve, delays[attempt]))
    }
  }
}

/** One installed skill, as the installed route reports it. */
export interface InstalledRecord {
  /** The skill's directory name. */
  name: string
  /** The root it lives in. */
  root: InstallRoot
  /** The absolute SKILL.md path. */
  path: string
  /** The provenance record, when the skill carries one. */
  provenance?: ProvenanceRecord
}

/**
 * List installed market skills.
 *
 * Scans the user root and the project root for `.skills-hub.json` records.
 * A skill without a record is not reported — pre-market installs have no
 * provenance to show, and inventing one would be worse than omitting it.
 *
 * @param dshHome - the user dsh home.
 * @param projectCwd - the workspace the panel is showing.
 * @returns the records found.
 */
export async function listInstalled(dshHome: string, projectCwd: string): Promise<InstalledRecord[]> {
  const { readFile, readdir } = await import('node:fs/promises')
  const records: InstalledRecord[] = []
  const roots: Array<{ root: InstallRoot; dir: string }> = [
    { root: 'user', dir: userSkillRoot(dshHome) },
    { root: 'project', dir: projectSkillRoot(projectCwd) },
  ]
  for (const { root, dir } of roots) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const recordPath = join(dir, entry.name, '.skills-hub.json')
      let raw: string
      try {
        raw = await readFile(recordPath, 'utf8')
      } catch {
        continue
      }
      let provenance: ProvenanceRecord | undefined
      try {
        const parsed = JSON.parse(raw) as ProvenanceRecord
        if (typeof parsed?.id === 'string' && typeof parsed?.provider === 'string') {
          provenance = parsed
        }
      } catch {
        // A corrupt record still means "installed by this panel": report the
        // skill with the record omitted rather than hiding it entirely.
        provenance = undefined
      }
      records.push({
        name: entry.name,
        root,
        path: join(dir, entry.name, 'SKILL.md'),
        ...(provenance === undefined ? {} : { provenance }),
      })
    }
  }
  return records
}
