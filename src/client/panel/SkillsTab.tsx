/**
 * Skills tab: the grouped skill list, mirroring the shipped Plugin-manager
 * cards.
 *
 * Structural contract taken from the installed plugin-manager bundle:
 *   section.group > div.groupHead (h3.groupTitle + span.count) + ul.cards
 *   li.card > div.cardHead (span.cardIcon + div.cardMain + div.cardEnd)
 *           > [optional inline failure]
 *   div.cardMain > div.titleRow (title + status tags) + span.cardDesc
 *
 * A card is ONE row tall: a 48px hairline icon frame, the name and its status
 * tags, a single clamped description line, and the trailing actions. The
 * earlier revision stacked a hint paragraph under every row, which repeated the
 * same sentence down the page and made the list read as prose rather than a
 * list; the hints are now the group's own explanation, said once.
 *
 * Every control is an official primitive. This file owns data flow and the
 * card's composition only.
 *
 * @module @wulongxi/dsh-skills-hub/client/panel/SkillsTab
 */

import {
  Button,
  IconChevronDownOutlineRegular,
  IconRefreshOutlineRegular,
  IconSearchOutlineRegular,
  IconSkillOutlineRegular,
  Input,
  Menu,
  Modal,
  PathLabel,
  Pill,
  Switch,
  Tag,
  type MenuEntry,
  type TagTone,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useRef, useState } from 'react'
import { SkillsHubApi, type ListPayload, type SkillEntry } from '../api.ts'
import { zh } from '../locales.ts'
import { tt } from '../panel-helpers.ts'
import { selectGroups } from '../skill-filter.ts'
import { SkillPreviewDialog } from './SkillPreview.tsx'
import css from './panel.module.css'

/** Localized source-group title, falling back to the host's own copy. */
function groupTitle(group: { key: string; title: string }): string {
  const key = `group.${group.key}` as keyof typeof zh
  return key in zh ? tt(key) : group.title
}

/** Localized source-group hint, falling back to the host's own copy. */
function groupHint(group: { key: string; hint: string }): string {
  const key = `groupHint.${group.key}` as keyof typeof zh
  return key in zh ? tt(key) : group.hint
}

/**
 * Whether this row carries an enable switch.
 *
 * A row with a writable path switches by rewriting its own SKILL.md
 * frontmatter. A plugin-provided file has no such path, so its switch is
 * recorded in the panel's own store; a truly fileless registration has nothing
 * to switch and shows none.
 */
function canToggle(skill: SkillEntry): boolean {
  return skill.path !== undefined || skill.fileState === 'provider-file'
}

/**
 * The one status tag a card carries.
 *
 * Deliberately at most one: the enable state is already stated by the trailing
 * `Switch`, so a green "enabled" tag beside it said the same thing twice. What
 * remains is the fact a user cannot read off the switch — how the skill is
 * backed locally.
 */
function statusTag(skill: SkillEntry): { tone: TagTone; label: string } | undefined {
  if (skill.linked === true) return { tone: 'info', label: tt('list.linked') }
  if (skill.fileState === 'provider-file') return { tone: 'neutral', label: tt('list.providerFile') }
  if (skill.fileState === 'virtual') return { tone: 'quiet', label: tt('list.noFile') }
  return undefined
}

/** One skill as a card: icon frame, name and tags, clamped description, actions. */
function SkillCard({ skill, api, onChanged, onEdit }: {
  skill: SkillEntry
  api: SkillsHubApi
  onChanged: () => void
  onEdit: (skill: SkillEntry) => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  // Sync ref guard: React state updates are async, so a double click before the
  // re-render would fire the same request twice with the stale target.
  const busyRef = useRef(false)

  const toggle = async (): Promise<void> => {
    if (busyRef.current || !canToggle(skill)) return
    busyRef.current = true
    setBusy(true)
    setError(undefined)
    try {
      // Two identities, one switch: a row with a file certifies the path the
      // write routes re-scan, a plugin-provided row certifies the (provider,
      // name) pair the host records in the panel's own store.
      if (skill.path !== undefined) await api.setEnabled(skill.name, skill.path, !skill.modelInvocable)
      else await api.setProviderEnabled(skill.name, skill.provider, !skill.modelInvocable)
      onChanged()
    } catch (err) {
      setError(tt('list.toggleFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    const path = skill.path
    if (path === undefined || busyRef.current) return
    setConfirming(false)
    busyRef.current = true
    setBusy(true)
    setError(undefined)
    try {
      await api.remove(skill.name, path)
      onChanged()
    } catch (err) {
      setError(tt('list.deleteFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const isIsolated = skill.isActiveWorkspace === false
  const badge = statusTag(skill)
  const editable = skill.path !== undefined && skill.linked !== true
  const invocableLabel = skill.modelInvocable ? tt('list.enabled') : tt('list.disabled')

  return (
    <li
      className={css.card}
      data-dsh-part="skill-card"
      data-skill={skill.name}
      {...(isIsolated ? { 'data-isolated': '' } : {})}
    >
      <div className={css.cardHead}>
        <span className={css.cardIcon} aria-hidden="true">
          <IconSkillOutlineRegular size={20} />
        </span>

        <div className={css.cardMain}>
          <div className={css.titleRow}>
            {/* The name is the preview trigger, matching the shipped cards,
                whose title is the button that opens their detail page. Every
                skill previews, including bundled and runtime-registered ones,
                which have no file to open. */}
            <button
              type="button"
              className={`${css.cardTitle} ${css.cardId} ${css.cardOpen}`}
              aria-label={tt('preview.open', { name: skill.name })}
              onClick={() => { setPreviewing(true) }}
            >
              {skill.name}
            </button>
            {badge !== undefined && <Tag tone={badge.tone}>{badge.label}</Tag>}
            {isIsolated && <Tag tone="warning">{tt('workspace.isolated')}</Tag>}
          </div>
          <span className={css.cardDesc} title={skill.description}>{skill.description}</span>
          {skill.path !== undefined && (
            <div className={css.cardPath}><PathLabel path={skill.path} /></div>
          )}
        </div>

        <div className={css.cardEnd}>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setPreviewing(true) }}>
            {tt('preview.action')}
          </Button>
          {editable && (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { onEdit(skill) }}>
                {tt('list.edit')}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setConfirming(true) }}>
                {tt('list.delete')}
              </Button>
            </>
          )}
          {canToggle(skill) && (
            <Switch
              checked={skill.modelInvocable}
              disabled={busy}
              label={invocableLabel}
              title={invocableLabel}
              onChange={() => { void toggle() }}
            />
          )}
        </div>
      </div>

      {error !== undefined && <p className={css.cardError} data-dsh-part="card-error">{error}</p>}

      {previewing && (
        <SkillPreviewDialog api={api} skill={skill} onClose={() => { setPreviewing(false) }} />
      )}

      {/* Deleting moves a file, so it asks first — through the shared modal
          rather than window.confirm, which cannot be themed or localized. */}
      <Modal
        open={confirming}
        title={tt('list.deleteTitle')}
        description={tt('list.deleteConfirm', { name: skill.name })}
        closeLabel={tt('common.cancel')}
        onClose={() => { setConfirming(false) }}
        footer={(
          <>
            <Button variant="outline" size="md" onClick={() => { setConfirming(false) }}>
              {tt('common.cancel')}
            </Button>
            <Button variant="primary" size="md" onClick={() => { void remove() }}>
              {tt('list.delete')}
            </Button>
          </>
        )}
      />
    </li>
  )
}

/** The workspace filter: an official Pill anchor over an official Menu. */
function WorkspaceFilter({ payload, value, onChange }: {
  payload: ListPayload
  value: string
  onChange: (next: string) => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const workspaces = payload.workspaces
  if (workspaces === undefined || workspaces.length <= 1) return null

  const items: MenuEntry[] = [
    { id: 'all', label: tt('filter.workspaceAll') },
    ...workspaces.map(ws => ({
      id: ws.root,
      label: ws.active ? tt('filter.workspaceCurrent', { name: ws.name }) : ws.name,
    })),
  ]
  const current = workspaces.find(ws => ws.root === value)

  return (
    <Menu
      open={open}
      items={items}
      selectedId={value}
      align="end"
      onSelect={(id) => { onChange(id); setOpen(false) }}
      onClose={() => { setOpen(false) }}
      anchor={(
        <Pill
          active={open}
          onClick={() => { setOpen(!open) }}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {current === undefined ? tt('filter.workspaceAll') : current.name}
          <IconChevronDownOutlineRegular size={14} />
        </Pill>
      )}
    />
  )
}

/** The skills tab body. */
export function SkillsTab({ api, onEdit }: { api: SkillsHubApi; onEdit: (skill: SkillEntry) => void }): React.JSX.Element {
  const [payload, setPayload] = useState<ListPayload | undefined>(undefined)
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  // Sequence guard: a slow earlier load must not overwrite a newer one.
  const loadSeq = useRef(0)

  const load = async (): Promise<void> => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const next = await api.list()
      if (seq !== loadSeq.current) return
      setPayload(next)
      setError(undefined)
    } catch (err) {
      if (seq !== loadSeq.current) return
      setError(tt('list.loadFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      // A newer load owns the flag while it runs.
      if (seq === loadSeq.current) setLoading(false)
    }
  }

  useEffect(() => { void load() }, [api])

  // Last-good policy: a failed refresh keeps the previous payload visible and
  // reports the error inline; the empty state replaces the list only when there
  // is nothing to fall back to.
  if (payload === undefined) {
    return (
      <div className={css.empty} data-dsh-part="empty-state">
        <IconSkillOutlineRegular size={28} className={css.emptyIcon} />
        <p className={css.emptyText}>{loading ? tt('list.loading') : error}</p>
        {!loading && (
          <Button
            size="sm"
            variant="outline"
            icon={<IconRefreshOutlineRegular size={16} />}
            onClick={() => { void load() }}
          >
            {tt('action.retry')}
          </Button>
        )}
      </div>
    )
  }

  const visibleGroups = selectGroups(payload.groups, { workspace: selectedWorkspace, query })
  const visibleCount = visibleGroups.reduce((total, group) => total + group.skills.length, 0)

  return (
    <>
      {/* The search field keeps a bounded width, so a flexible spacer after the
          filters pushes the trailing actions to the column's right edge instead
          of leaving them stranded mid-page. */}
      <div className={css.filterBar}>
        <div className={css.filterField}>
          <Input
            type="search"
            value={query}
            spellCheck={false}
            aria-label={tt('filter.searchLabel')}
            placeholder={tt('filter.searchPlaceholder')}
            icon={<IconSearchOutlineRegular size={16} />}
            onChange={event => { setQuery(event.target.value) }}
            onKeyDown={event => { if (event.key === 'Escape' && query !== '') setQuery('') }}
          />
        </div>
        <WorkspaceFilter payload={payload} value={selectedWorkspace} onChange={setSelectedWorkspace} />
        <div className={css.filterSpacer} />
        {!loading && (
          <Button
            size="sm"
            variant="ghost"
            icon={<IconRefreshOutlineRegular size={16} />}
            aria-label={tt('action.refresh')}
            title={tt('action.refresh')}
            onClick={() => { void load() }}
          />
        )}
      </div>

      {error !== undefined && (
        <p className={css.banner} data-dsh-part="list-error">{error}</p>
      )}

      {visibleCount === 0
        ? (
          <div className={css.empty} data-dsh-part="empty-state">
            <IconSkillOutlineRegular size={28} className={css.emptyIcon} />
            <p className={css.emptyText}>
              {query.trim() === '' ? tt('filter.emptyWorkspace') : tt('filter.empty', { query: query.trim() })}
            </p>
          </div>
        )
        : visibleGroups.map(group => (
          <section key={group.key} className={css.group} data-dsh-part="source-group" data-source={group.key}>
            <div className={css.groupHead}>
              <h3 className={css.groupTitle}>{groupTitle(group)}</h3>
              <span className={css.count}>{group.skills.length}</span>
            </div>
            {/* The group's explanation is stated once, here, rather than
                repeated under every row. */}
            {groupHint(group) !== '' && <p className={css.groupHint}>{groupHint(group)}</p>}
            <ul className={css.cards}>
              {group.skills.map(skill => (
                <SkillCard
                  key={skill.name}
                  skill={skill}
                  api={api}
                  onChanged={() => { void load() }}
                  onEdit={onEdit}
                />
              ))}
            </ul>
          </section>
        ))}
    </>
  )
}
