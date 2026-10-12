/**
 * Edit tab: the in-place editor for one skill.
 *
 * Controls are official primitives (`Input`, `Button`); only the multi-line
 * body editor is drawn here, because the official library ships no textarea.
 *
 * The list carries metadata only, so the host re-reads the file before the form
 * is shown and writes it back on save; the name and the location are fixed, and
 * the enabled state keeps its own control on the row.
 *
 * @module @wulongxi/dsh-skills-hub/client/panel/EditTab
 */

import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useState, type FormEvent } from 'react'
import { SkillsHubApi, type SkillEntry } from '../api.ts'
import { tt } from '../panel-helpers.ts'
import css from './panel.module.css'

/** Edit tab props. */
export interface EditTabProps {
  /** The skills hub API client. */
  api: SkillsHubApi
  /** The skill whose file this form rewrites. */
  skill: SkillEntry
  /** Called after a successful save: the list refetches on the way back. */
  onDone: () => void
  /** Called when the user leaves without saving. */
  onCancel: () => void
}

/** The edit tab body. */
export function EditTab({ api, skill, onDone, onCancel }: EditTabProps): React.JSX.Element {
  const skillPath = skill.path ?? ''
  const [description, setDescription] = useState('')
  const [whenToUse, setWhenToUse] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const current = await api.read(skill.name, skillPath)
        if (cancelled) return
        setDescription(current.description)
        setWhenToUse(current.whenToUse ?? '')
        setContent(current.content)
        setError(undefined)
      } catch (err) {
        if (cancelled) return
        setError(tt('edit.loadFailed', { error: err instanceof Error ? err.message : String(err) }))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [api, skill.name, skillPath])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (description.trim() === '' || content.trim() === '') {
      setError(tt('create.empty'))
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      await api.update({ name: skill.name, path: skillPath, description: description.trim(), whenToUse: whenToUse.trim() || undefined, content })
      onDone()
    } catch (err) {
      setError(tt('edit.failed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className={css.emptyText}>{tt('edit.loading')}</p>
  }

  return (
    <form className={css.form} onSubmit={event => { void submit(event) }}>
      <div className={css.field}>
        <span className={css.fieldLabel}>{tt('edit.name')}</span>
        <Input value={skill.name} readOnly disabled />
      </div>

      <label className={css.field}>
        <span className={css.fieldLabel}>{tt('create.description')}</span>
        <Input value={description} onChange={event => { setDescription(event.target.value) }} />
      </label>

      <label className={css.field}>
        <span className={css.fieldLabel}>{tt('create.whenToUse')}</span>
        <Input value={whenToUse} onChange={event => { setWhenToUse(event.target.value) }} />
      </label>

      <label className={css.field}>
        <span className={css.fieldLabel}>{tt('create.content')}</span>
        <textarea
          className={css.textarea}
          value={content}
          spellCheck={false}
          onChange={event => { setContent(event.target.value) }}
        />
      </label>

      <div className={css.formActions}>
        <Button type="submit" size="md" variant="primary" disabled={busy}>
          {tt('edit.submit')}
        </Button>
        <Button type="button" size="md" variant="outline" disabled={busy} onClick={onCancel}>
          {tt('edit.back')}
        </Button>
      </div>

      {error !== undefined && <p className={css.feedback} data-kind="error">{error}</p>}
      <p className={css.hint}>{tt('edit.note')}</p>
    </form>
  )
}
