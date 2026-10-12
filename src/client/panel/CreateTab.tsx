/**
 * Create tab: the new-skill form (user or project root).
 *
 * Controls are official primitives (`Input`, `Button`, `SegmentedControl` for
 * the target root, `Tag` for the success badge); only the multi-line body
 * editor is drawn here, because the official library ships no textarea.
 *
 * The host's create route needs the workspace the panel is showing, which the
 * list payload carries. The inactive tab unmounts, so a user who opens this tab
 * first has no cwd: the first submit resolves it with one list call and reuses
 * it afterwards.
 *
 * @module @wulongxi/dsh-skills-hub/client/panel/CreateTab
 */

import { Button, Input, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type FormEvent } from 'react'
import { SkillsHubApi } from '../api.ts'
import { tt } from '../panel-helpers.ts'
import css from './panel.module.css'

/** Create-form feedback line. */
type Feedback = { text: string; kind: 'ok' | 'error' }

/** The target-root segmented control id. */
const ROOT_ID = 'skills-hub-create-root'

/** The create tab body. */
export function CreateTab({ api }: { api: SkillsHubApi }): React.JSX.Element {
  const [root, setRoot] = useState<'user' | 'project'>('user')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [whenToUse, setWhenToUse] = useState('')
  const [content, setContent] = useState('')
  const [cwd, setCwd] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | undefined>(undefined)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (name.trim() === '' || description.trim() === '' || content.trim() === '') {
      setFeedback({ text: tt('create.empty'), kind: 'error' })
      return
    }
    setBusy(true)
    try {
      const workspace = cwd ?? (await api.list()).cwd
      setCwd(workspace)
      const result = await api.create({
        root,
        name: name.trim(),
        description: description.trim(),
        whenToUse: whenToUse.trim() || undefined,
        content,
        cwd: workspace,
      })
      setFeedback({ text: tt('create.created', { path: result.path }), kind: 'ok' })
      setName('')
      setDescription('')
      setWhenToUse('')
      setContent('')
    } catch (err) {
      setFeedback({ text: tt('create.failed', { error: err instanceof Error ? err.message : String(err) }), kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={css.form} onSubmit={event => { void submit(event) }}>
      <div className={css.field}>
        <span className={css.fieldLabel}>{tt('create.root')}</span>
        <SegmentedControl
          id={ROOT_ID}
          value={root}
          options={[
            { value: 'user', label: tt('create.root.user') },
            { value: 'project', label: tt('create.root.project') },
          ]}
          onChange={setRoot}
          label={tt('create.root')}
        />
      </div>

      <label className={css.field}>
        <span className={css.fieldLabel}>{tt('create.name')}</span>
        <Input
          value={name}
          spellCheck={false}
          placeholder={tt('create.namePlaceholder')}
          onChange={event => { setName(event.target.value) }}
        />
      </label>

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
          {busy ? tt('create.submitting') : tt('create.submit')}
        </Button>
      </div>

      {feedback !== undefined && <p className={css.feedback} data-kind={feedback.kind}>{feedback.text}</p>}
      <p className={css.hint}>{tt('create.note')}</p>
    </form>
  )
}
