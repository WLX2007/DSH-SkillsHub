/**
 * Market tab: search the online skill registries and read a skill's detail.
 *
 * The tab is a page in the shipped shape: a search field, a results list built
 * from the same card anatomy the skills list uses, and a detail dialog rendered
 * by the shell's own markdown renderer. What it deliberately does NOT have yet
 * is an install action — that is the next milestone, and until the host serves
 * it the tab offers nothing that can only fail.
 *
 * A search spans every source the host registers. A source that is down
 * degrades the page: its rows are absent and the failure is reported as a
 * dismissible note above the results, rather than blanking the tab.
 *
 * @module @wulongxi/dsh-skills-hub/client/panel/MarketTab
 */

import {
  Button,
  IconChevronDownOutlineRegular,
  IconGlobeOutlineRegular,
  IconRefreshOutlineRegular,
  IconSearchOutlineRegular,
  IconSkillOutlineRegular,
  Input,
  MarkdownText,
  Menu,
  Modal,
  PathLabel,
  Pill,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SkillsHubApi,
  type MarketDetail,
  type MarketSkill,
  type MarketSourceInfo,
} from '../api.ts'
import { tt } from '../panel-helpers.ts'
import css from './panel.module.css'

/**
 * Build the markdown chrome copy for one render.
 *
 * The label object must keep a stable identity across renders or the renderer
 * discards its parse cache, hence the memo at the call site.
 *
 * @returns labels for code fences and footnotes.
 */
function markdownLabels(): Parameters<typeof MarkdownText>[0]['labels'] {
  return {
    code: {
      copyLabel: tt('preview.copy'),
      copiedLabel: tt('preview.copied'),
      toolbarLabels: {
        codeLabel: tt('preview.code'),
        wrapLabel: tt('preview.wrap'),
        unwrapLabel: tt('preview.unwrap'),
      },
    },
    footnotes: tt('preview.footnotes'),
  }
}

/** Search-form feedback. */
type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }

/** The market tab body. */
export function MarketTab({ api }: { api: SkillsHubApi }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [state, setState] = useState<SearchState>({ kind: 'idle' })
  const [results, setResults] = useState<MarketSkill[] | undefined>(undefined)
  const [failures, setFailures] = useState<Array<{ source: string; message: string }>>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [sources, setSources] = useState<MarketSourceInfo[] | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  // Sequence guard: a slow earlier search must not overwrite a newer one.
  const searchSeq = useRef(0)
  const labels = useMemo(() => markdownLabels(), [])

  // The source list is static for the process lifetime; one fetch decorates the
  // filter and tells the user which registries exist.
  useEffect(() => {
    let cancelled = false
    api.marketSources()
      .then(payload => { if (!cancelled) setSources(payload.sources) })
      .catch(() => { /* the filter stays hidden; search still works */ })
    return () => { cancelled = true }
  }, [api])

  const runSearch = async (text: string, limit = 20): Promise<void> => {
    const seq = ++searchSeq.current
    setState({ kind: 'loading' })
    try {
      const payload = await api.marketSearch(text, limit)
      if (seq !== searchSeq.current) return
      setResults(payload.skills)
      setCounts(payload.counts)
      setFailures(payload.failures)
      setState({ kind: 'idle' })
    } catch (err) {
      if (seq !== searchSeq.current) return
      setResults(undefined)
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const submit = (): void => {
    const text = query.trim()
    setSubmitted(text)
    if (text === '') {
      setResults(undefined)
      setState({ kind: 'idle' })
      return
    }
    void runSearch(text)
  }

  const searchable = sources?.some(source => source.searchable) ?? true

  return (
    <div className={css.market} data-dsh-part="market">
      <div className={css.filterBar}>
        <div className={css.filterField}>
          <Input
            type="search"
            value={query}
            spellCheck={false}
            aria-label={tt('market.searchLabel')}
            placeholder={tt('market.searchPlaceholder')}
            icon={<IconSearchOutlineRegular size={16} />}
            onChange={event => { setQuery(event.target.value) }}
            onKeyDown={event => { if (event.key === 'Enter') submit() }}
          />
        </div>
        <Button size="md" variant="primary" disabled={state.kind === 'loading'} onClick={submit}>
          {state.kind === 'loading' ? tt('market.searching') : tt('market.searchAction')}
        </Button>
        <div className={css.filterSpacer} />
      </div>

      {/* Which registries the host carries, and which of them answered. */}
      {sources !== undefined && sources.length > 0 && (
        <p className={css.marketSourcesLine} data-dsh-part="market-sources">
          {tt('market.sourcesLabel')}
          {sources.map(source => (
            <Tag key={source.name} tone={source.searchable ? 'outline' : 'quiet'}>{source.name}</Tag>
          ))}
        </p>
      )}

      {state.kind === 'error' && <p className={css.banner} data-dsh-part="market-error">{state.message}</p>}
      {failures.length > 0 && results !== undefined && (
        <p className={css.marketNotice} data-dsh-part="market-failures">
          {tt('market.partialFailure', { sources: failures.map(entry => entry.source).join(', ') })}
        </p>
      )}

      {/* Results: the same card anatomy as the skills list, one row per skill. */}
      {results !== undefined && submitted !== '' && (
        results.length === 0
          ? (
            <div className={css.empty} data-dsh-part="market-empty">
              <IconGlobeOutlineRegular size={28} className={css.emptyIcon} />
              <p className={css.emptyText}>{tt('market.noResults', { query: submitted })}</p>
            </div>
          )
          : (
            <ul className={css.cards} data-dsh-part="market-results">
              {results.map(skill => (
                <MarketRow key={skill.id} skill={skill} onOpen={() => { setDetailId(skill.id) }} />
              ))}
            </ul>
          )
      )}

      {state.kind === 'idle' && results === undefined && searchable && submitted === '' && (
        <div className={css.empty} data-dsh-part="market-hint">
          <IconGlobeOutlineRegular size={28} className={css.emptyIcon} />
          <p className={css.emptyText}>{tt('market.searchEmpty')}</p>
        </div>
      )}

      {detailId !== undefined && (
        <MarketDetailDialog
          api={api}
          id={detailId}
          labels={labels}
          onClose={() => { setDetailId(undefined) }}
        />
      )}
    </div>
  )
}

/** One result row: the shipped card anatomy, opening the detail on its name. */
function MarketRow({ skill, onOpen }: { skill: MarketSkill; onOpen: () => void }): React.JSX.Element {
  return (
    <li className={css.card} data-dsh-part="market-row" data-skill={skill.name}>
      <div className={css.cardHead}>
        <span className={css.cardIcon} aria-hidden="true">
          <IconSkillOutlineRegular size={20} />
        </span>
        <div className={css.cardMain}>
          <div className={css.titleRow}>
            <button
              type="button"
              className={`${css.cardTitle} ${css.cardId} ${css.cardOpen}`}
              aria-label={tt('market.openDetail', { name: skill.name })}
              onClick={onOpen}
            >
              {skill.name}
            </button>
            <Tag tone="outline">{skill.sourceLabel}</Tag>
          </div>
          <span className={css.cardDesc} title={skill.description}>
            {skill.description !== '' ? skill.description : tt('market.noDescription')}
          </span>
          <div className={css.cardPath}><PathLabel path={`${skill.origin.owner}/${skill.origin.repo}`} /></div>
        </div>
        <div className={css.cardEnd}>
          {skill.installs !== undefined && (
            <span className={css.marketInstalls} data-dsh-part="installs">
              {tt('market.installs', { count: skill.installs.toLocaleString() })}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={onOpen}>
            {tt('market.detailAction')}
          </Button>
        </div>
      </div>
    </li>
  )
}

/** The detail dialog: the skill's own instructions, rendered by the shell. */
function MarketDetailDialog({ api, id, labels, onClose }: {
  api: SkillsHubApi
  id: string
  labels: Parameters<typeof MarkdownText>[0]['labels']
  onClose: () => void
}): React.JSX.Element {
  const [detail, setDetail] = useState<MarketDetail | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const loadSeq = useRef(0)

  const load = async (): Promise<void> => {
    const seq = ++loadSeq.current
    setLoading(true)
    setError(undefined)
    try {
      const next = await api.marketDetail(id)
      if (seq !== loadSeq.current) return
      setDetail(next)
    } catch (err) {
      if (seq !== loadSeq.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // Reloaded only when the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, id])

  const skill = detail?.skill

  return (
    <Modal
      open
      onClose={onClose}
      title={skill?.name ?? tt('preview.loading')}
      closeLabel={tt('common.close')}
      {...(skill === undefined || skill.description === ''
        ? {}
        : { description: skill.description })}
      className={css.previewDialog}
      contentClassName={css.previewContent}
      footer={(
        <div className={css.previewFoot}>
          {skill !== undefined && (
            <div className={css.previewMeta}>
              <Tag tone="outline">{skill.provider}</Tag>
              <PathLabel path={`${skill.origin.owner}/${skill.origin.repo}`} />
            </div>
          )}
          <div className={css.formActions}>
            {error !== undefined && (
              <Button size="sm" variant="outline" icon={<IconRefreshOutlineRegular size={16} />} onClick={() => { void load() }}>
                {tt('action.retry')}
              </Button>
            )}
            <Button variant="outline" size="md" onClick={onClose}>{tt('common.close')}</Button>
          </div>
        </div>
      )}
    >
      {loading && <p className={css.previewStatus}>{tt('preview.loading')}</p>}
      {!loading && error !== undefined && (
        <p className={css.previewStatus}>
          {tt('preview.failed', { error })}
        </p>
      )}
      {!loading && detail !== undefined && (
        <div data-dsh-part="market-detail">
          <dl className={css.previewMetaList} data-dsh-part="preview-meta">
            <dt className={css.previewMetaKey}>{tt('preview.field.name')}</dt>
            <dd className={css.previewMetaValue}><code className={css.previewCode}>{detail.skill.name}</code></dd>
            {detail.frontmatter.whenToUse !== undefined && detail.frontmatter.whenToUse !== '' && (
              <>
                <dt className={css.previewMetaKey}>{tt('preview.field.whenToUse')}</dt>
                <dd className={css.previewMetaValue}>{detail.frontmatter.whenToUse}</dd>
              </>
            )}
            <dt className={css.previewMetaKey}>{tt('market.field.files')}</dt>
            <dd className={css.previewMetaValue}>
              {tt('market.filesSummary', {
                count: String(detail.files.length),
                size: formatBytes(detail.totalBytes),
              })}
            </dd>
          </dl>
          {detail.body.trim() === ''
            ? <p className={css.previewStatus}>{tt('preview.emptyBody')}</p>
            : (
              <div className={css.previewBody} data-dsh-part="market-rendered">
                <MarkdownText text={detail.body} labels={labels} variant="body" />
              </div>
            )}
          {detail.files.length > 1 && (
            <p className={css.marketFileList} data-dsh-part="market-files">
              {detail.files.slice(0, 12).map(file => (
                <code key={file.path} className={css.previewCode}>{file.path}</code>
              ))}
              {detail.files.length > 12 && (
                <span className={css.marketMore}>{tt('market.moreFiles', { count: String(detail.files.length - 12) })}</span>
              )}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

/** Format a byte count for the file summary, matching the shell's own rounding. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** The source filter pill row: which registries carried results for this query. */
export function SourceFilter({ counts, sources, value, onChange }: {
  counts: Record<string, number>
  sources: MarketSourceInfo[] | undefined
  value: string
  onChange: (next: string) => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const names = sources?.map(source => source.name) ?? Object.keys(counts)
  if (names.length === 0) return null
  const items = names.map(name => ({ id: name, label: name }))
  return (
    <Menu
      open={open}
      items={items}
      selectedId={value}
      align="end"
      onSelect={id => { onChange(id); setOpen(false) }}
      onClose={() => { setOpen(false) }}
      anchor={(
        <Pill active={open} onClick={() => { setOpen(!open) }} aria-haspopup="menu" aria-expanded={open}>
          {value === 'all' ? tt('market.allSources') : value}
          <IconChevronDownOutlineRegular size={14} />
        </Pill>
      )}
    />
  )
}
