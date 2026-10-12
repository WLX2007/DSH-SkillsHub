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
  Switch,
  Tag,
  TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SkillsHubApi,
  type MarketDetail,
  type MarketLicence,
  type MarketSkill,
  type MarketSourceInfo,
} from '../api.ts'
import { tt } from '../panel-helpers.ts'
import css from './panel.module.css'

/** Rows per search page. Small enough that "load more" lands fast. */
const PAGE_SIZE = 20

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

/**
 * The page state a search has reached.
 *
 * `page` is the last page answered, `hasMore` the host's own word on whether a
 * later one exists, and `exhausted` distinguishes "this source pages and there
 * is no more" from "this source never paged at all" — the two read differently
 * at the end of the list.
 */
interface Paged {
  page: number
  hasMore: boolean
  exhausted: boolean
}

/** The market tab body. */
export function MarketTab({ api }: { api: SkillsHubApi }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [state, setState] = useState<SearchState>({ kind: 'idle' })
  const [results, setResults] = useState<MarketSkill[] | undefined>(undefined)
  const [paged, setPaged] = useState<Paged | undefined>(undefined)
  const [failures, setFailures] = useState<Array<{ source: string; message: string }>>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [sources, setSources] = useState<MarketSourceInfo[] | undefined>(undefined)
  // The source the user picked BEFORE searching. Undefined means "every
  // source"; the search is what applies the choice, so switching it after a
  // search does not silently rewrite the results already on screen.
  const [selectedSource, setSelectedSource] = useState<string>('all')
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  // Sequence guard: a slow earlier search must not overwrite a newer one.
  const searchSeq = useRef(0)
  const labels = useMemo(() => markdownLabels(), [])

  // The source list is static for the process lifetime; one fetch populates
  // the picker the user chooses from before searching.
  useEffect(() => {
    let cancelled = false
    api.marketSources()
      .then(payload => { if (!cancelled) setSources(payload.sources) })
      .catch(() => { /* the picker stays on "all"; search still works */ })
    return () => { cancelled = true }
  }, [api])

  /**
   * Search one page.
   * @param mode - `replace` starts the query over; `append` is "load more".
   */
  const runSearch = async (text: string, mode: 'replace' | 'append', source: string, page: number): Promise<void> => {
    const seq = ++searchSeq.current
    setState({ kind: 'loading' })
    try {
      const payload = await api.marketSearch(text, PAGE_SIZE, source === 'all' ? undefined : source, page)
      if (seq !== searchSeq.current) return
      // A named source cannot page, so it reports hasMore false on page one
      // already; a source that cannot page never becomes "exhausted" either,
      // because it never promised a second page. Only a paging source that has
      // served its last page reads as exhausted.
      const pagedSource = sources?.find(entry => entry.name === (source === 'all' ? undefined : source))
      const pages = pagedSource?.pageable ?? source === 'all'
      setResults(previous => (mode === 'append' && previous !== undefined
        ? [...previous, ...payload.skills]
        : payload.skills))
      setPaged({ page: payload.page, hasMore: payload.hasMore, exhausted: pages && !payload.hasMore })
      setCounts(payload.counts)
      setFailures(payload.failures)
      setState({ kind: 'idle' })
    } catch (err) {
      if (seq !== searchSeq.current) return
      if (mode === 'append') {
        // "Load more" failing must not blank the rows already on screen.
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
        return
      }
      setResults(undefined)
      setPaged(undefined)
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const submit = (): void => {
    const text = query.trim()
    setSubmitted(text)
    if (text === '') {
      setResults(undefined)
      setPaged(undefined)
      setState({ kind: 'idle' })
      return
    }
    void runSearch(text, 'replace', selectedSource, 1)
  }

  const loadMore = (): void => {
    if (paged === undefined || !paged.hasMore || state.kind === 'loading') return
    void runSearch(submitted, 'append', selectedSource, paged.page + 1)
  }

  const searchable = sources?.some(source => source.searchable) ?? true

  return (
    <div className={css.market} data-dsh-part="market">
      {/* The source is chosen before the search: a request means "search this
          registry", not "search everything and mix it". The picker sits beside
          the search field so the choice is visibly part of the query. */}
      <div className={css.filterBar}>
        <SourcePicker sources={sources} value={selectedSource} onChange={setSelectedSource} />
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

      {state.kind === 'error' && <p className={css.banner} data-dsh-part="market-error">{state.message}</p>}
      {failures.length > 0 && results !== undefined && (
        <p className={css.marketNotice} data-dsh-part="market-failures">
          {tt('market.partialFailure', { sources: failures.map(entry => entry.source).join(', ') })}
        </p>
      )
      }

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

      {/* The tail of the list: one of three states, never silent. While a page
          is loading the previous rows stay visible, so "load more" reads as an
          addition rather than a reload. */}
      {results !== undefined && submitted !== '' && results.length > 0 && (
        state.kind === 'loading' ? (
          <p className={css.marketTail} data-dsh-part="market-loading">
            <TextShimmer active className={css.marketTailText}>{tt('market.loadingMore')}</TextShimmer>
          </p>
        ) : paged !== undefined && paged.hasMore ? (
          <div className={css.marketTail} data-dsh-part="market-more">
            <Button size="md" variant="outline" onClick={loadMore}>
              {tt('market.loadMore')}
            </Button>
          </div>
        ) : (
          <p className={css.marketTail} data-dsh-part="market-end">
            <span className={css.marketTailText}>
              {paged?.exhausted === true ? tt('market.exhausted') : tt('market.endOfSource')}
            </span>
          </p>
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

/**
 * The licence a skill declares, shown on the row.
 *
 * A declared licence is an informative tag; an undeclared one is a warning,
 * because roughly half the catalogue declares nothing and copying those files
 * is a decision the user should notice they are making. Both states render —
 * an undeclared licence must not quietly read as "no licence information
 * available yet".
 *
 * @param licence - what the skill declares, or that it declares nothing.
 * @returns the tag.
 */
function LicenceTag({ licence }: { licence: MarketLicence }): React.JSX.Element {
  return licence.state === 'declared'
    ? <Tag tone="info">{tt('market.licence.declared', { licence: licence.licence })}</Tag>
    : <Tag tone="warning">{tt('market.licence.undeclared')}</Tag>
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
            {skill.licence !== undefined && (
              <LicenceTag licence={skill.licence} />
            )}
            <Tag tone="outline">{skill.sourceLabel}</Tag>
          </div>
          <span className={css.cardDesc} title={skill.description}>
            {skill.description !== '' ? skill.description : tt('market.noDescription')}
          </span>
          <div className={css.cardPath}>
            <PathLabel path={skill.origin.kind === 'skillhub'
              ? `skillhub.cn/${skill.origin.slug}`
              : `${skill.origin.owner}/${skill.origin.repo}`} />
          </div>
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
              <PathLabel path={skill.origin.kind === 'skillhub'
                ? `skillhub.cn/${skill.origin.slug}`
                : `${skill.origin.owner}/${skill.origin.repo}`} />
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
            {detail.skill.licence !== undefined && (
              <>
                <dt className={css.previewMetaKey}>{tt('market.licence.field')}</dt>
                <dd className={css.previewMetaValue}><LicenceTag licence={detail.skill.licence} /></dd>
              </>
            )}
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

/**
 * The source picker: which registry the next search will ask.
 *
 * Chosen BEFORE the search, so it sits to the left of the field and reads as
 * part of the query rather than as a filter applied after the fact. "all"
 * searches every source at once; each named option is one registry, and the
 * count of results it carried for the last search is shown beside its name so
 * the choice is informed.
 *
 * @param sources - the sources the host registers; undefined while loading.
 * @param value - the selected source name, or 'all'.
 * @param onChange - called with the chosen source name.
 * @returns the picker, or null when the host registers fewer than two sources.
 */
function SourcePicker({ sources, value, onChange }: {
  sources: MarketSourceInfo[] | undefined
  value: string
  onChange: (next: string) => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const names = sources?.map(source => source.name) ?? []
  // One source needs no choice: there is nothing to pick between, and a
  // picker over a single option would only imply a choice exists.
  if (names.length < 2) return null
  const items = [
    { id: 'all', label: tt('market.allSources') },
    ...names.map(name => ({ id: name, label: name })),
  ]
  const current = items.find(item => item.id === value)
  return (
    <Menu
      open={open}
      items={items}
      selectedId={value}
      align="start"
      onSelect={id => { onChange(id); setOpen(false) }}
      onClose={() => { setOpen(false) }}
      anchor={(
        <Pill active={open} onClick={() => { setOpen(!open) }} aria-haspopup="menu" aria-expanded={open}>
          {current?.label ?? tt('market.allSources')}
          <IconChevronDownOutlineRegular size={14} />
        </Pill>
      )}
    />
  )
}
