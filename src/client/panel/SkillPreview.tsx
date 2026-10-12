/**
 * Skill preview dialog.
 *
 * Uses the shell's own markdown renderer (`MarkdownText`) inside the shared
 * `Modal`, so a skill body reads exactly the way it does in a conversation:
 * the same GFM parsing, the same code fences with their copy toolbar, the same
 * theme tokens. Raw HTML stays disabled and link protocols are allowlisted by
 * the primitive itself, which matters because a skill body is untrusted text
 * that may come from a downloaded repository.
 *
 * The dialog previews ANY skill, including bundled and runtime-registered ones.
 * Those have no SKILL.md the panel may open, so the host resolves them through
 * the skill registry instead and reports `source: 'registry'` — the dialog then
 * says the text came from the registry rather than showing a path that does not
 * describe a file on disk.
 *
 * @module @wulongxi/dsh-skills-hub/client/panel/SkillPreview
 */

import { Button, IconRefreshOutlineRegular, MarkdownText, Modal, PathLabel, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo, useState } from 'react'
import { SkillsHubApi, type SkillEntry, type SkillPreview } from '../api.ts'
import { tt } from '../panel-helpers.ts'
import css from './panel.module.css'

/**
 * Build the markdown chrome copy for one render.
 *
 * The renderer is cordis-free, so every user-facing string arrives by prop. The
 * object must stay referentially stable across renders or the renderer discards
 * its streaming cache, hence the memo at the call site.
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

/** Preview dialog props. */
export interface SkillPreviewDialogProps {
  /** The API client. */
  api: SkillsHubApi
  /** The skill to preview. */
  skill: SkillEntry
  /** Close the dialog. */
  onClose: () => void
}

/** The skill preview dialog. */
export function SkillPreviewDialog({ api, skill, onClose }: SkillPreviewDialogProps): React.JSX.Element {
  const [preview, setPreview] = useState<SkillPreview | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  // The label object identity must be stable, or the markdown renderer drops
  // its cache on every render.
  const labels = useMemo(() => markdownLabels(), [])

  /** Load one skill for preview; re-runnable from the failure state's Retry. */
  const load = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      const next = await api.preview(skill.name)
      setPreview(next)
    } catch (err) {
      setError(tt('preview.failed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      setLoading(true)
      setError(undefined)
      try {
        const next = await api.preview(skill.name)
        if (cancelled) return
        setPreview(next)
      } catch (err) {
        if (cancelled) return
        setError(tt('preview.failed', { error: err instanceof Error ? err.message : String(err) }))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [api, skill.name])

  const body = (() => {
    if (loading) return <p className={css.previewStatus}>{tt('preview.loading')}</p>
    if (error !== undefined) {
      return (
        <div className={css.previewStatus}>
          <p className={css.banner}>{error}</p>
          <Button
            size="sm"
            variant="outline"
            icon={<IconRefreshOutlineRegular size={16} />}
            onClick={() => { void load() }}
          >
            {tt('action.retry')}
          </Button>
        </div>
      )
    }
    if (preview === undefined) return null
    return (
      <div data-dsh-part="preview-body">
        {/* The frontmatter fields are shown as a definition list rather than as
            markdown: a leading `---` fence is a thematic break in GFM, so
            rendering the raw file would turn the YAML into a heading and
            stray prose. Only the body below it is markdown. */}
        <dl className={css.previewMetaList} data-dsh-part="preview-meta">
          <dt className={css.previewMetaKey}>{tt('preview.field.name')}</dt>
          <dd className={css.previewMetaValue}><code className={css.previewCode}>{preview.name}</code></dd>
          <dt className={css.previewMetaKey}>{tt('preview.field.description')}</dt>
          <dd className={css.previewMetaValue}>{preview.description}</dd>
          {preview.whenToUse !== undefined && preview.whenToUse !== '' && (
            <>
              <dt className={css.previewMetaKey}>{tt('preview.field.whenToUse')}</dt>
              <dd className={css.previewMetaValue}>{preview.whenToUse}</dd>
            </>
          )}
          <dt className={css.previewMetaKey}>{tt('preview.field.invocation')}</dt>
          <dd className={css.previewMetaValue}>
            {preview.modelInvocable ? tt('preview.field.modelYes') : tt('preview.field.modelNo')}
            {' / '}
            {preview.userInvocable ? tt('preview.field.userYes') : tt('preview.field.userNo')}
          </dd>
        </dl>
        {preview.markdown.trim() === ''
          ? <p className={css.previewStatus}>{tt('preview.emptyBody')}</p>
          : (
            <div className={css.previewBody} data-dsh-part="preview-rendered">
              <MarkdownText text={preview.markdown} labels={labels} variant="body" />
            </div>
          )}
      </div>
    )
  })()

  return (
    <Modal
      open
      onClose={onClose}
      title={skill.name}
      closeLabel={tt('common.close')}
      description={skill.description}
      className={css.previewDialog}
      contentClassName={css.previewContent}
      footer={(
        <div className={css.previewFoot}>
          {preview !== undefined && (
            <div className={css.previewMeta}>
              <Tag tone={preview.source === 'registry' ? 'neutral' : 'outline'}>
                {preview.source === 'registry' ? tt('preview.fromRegistry') : tt('preview.fromFile')}
              </Tag>
              {preview.path !== undefined && <PathLabel path={preview.path} />}
            </div>
          )}
          <Button variant="outline" size="md" onClick={onClose}>{tt('common.close')}</Button>
        </div>
      )}
    >
      {body}
    </Modal>
  )
}
