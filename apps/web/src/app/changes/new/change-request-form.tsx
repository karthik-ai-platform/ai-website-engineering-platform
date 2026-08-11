'use client'

import { useId, useState, type FormEvent } from 'react'

const modes = [
  'builder',
  'designer',
  'refactor',
  'debug',
  'seo',
  'performance',
  'accessibility',
  'content',
] as const

type Mode = (typeof modes)[number]

interface ReviewDraft {
  readonly prompt: string
  readonly mode: Mode
  readonly target: string
  readonly constraints: readonly string[]
  readonly attachmentNames: readonly string[]
}

export function ChangeRequestForm() {
  const promptId = useId()
  const modeId = useId()
  const targetId = useId()
  const constraintsId = useId()
  const attachmentsId = useId()
  const [review, setReview] = useState<ReviewDraft>()

  function prepareReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const prompt = formString(data, 'originalPrompt').trim()
    const mode = formString(data, 'mode', 'builder') as Mode
    const target = formString(data, 'target', 'preview')
    const constraints = formString(data, 'constraints')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
    const attachments = data
      .getAll('attachments')
      .filter((item): item is File => item instanceof File)
    setReview({
      prompt,
      mode,
      target,
      constraints,
      attachmentNames: attachments.filter((file) => file.size > 0).map((file) => file.name),
    })
  }

  return (
    <div className="change-layout">
      <form className="change-form" onSubmit={prepareReview} aria-describedby="intake-note">
        <div className="field-group">
          <label htmlFor={promptId}>Original request</label>
          <textarea
            id={promptId}
            name="originalPrompt"
            required
            maxLength={20000}
            rows={7}
            placeholder="Describe the website change and the outcome you expect."
          />
          <p className="field-help">
            Saved as immutable source intent. Corrections update requirements, never this text.
          </p>
        </div>

        <div className="field-row">
          <div className="field-group">
            <label htmlFor={modeId}>Mode</label>
            <select id={modeId} name="mode" defaultValue="builder">
              {modes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode[0]?.toUpperCase()}
                  {mode.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor={targetId}>Target environment</label>
            <select id={targetId} name="target" defaultValue="preview">
              <option value="preview">Preview</option>
              <option value="staging">Staging</option>
              <option value="production">Production request</option>
            </select>
          </div>
        </div>

        <div className="field-group">
          <label htmlFor={constraintsId}>Constraints</label>
          <textarea
            id={constraintsId}
            name="constraints"
            rows={4}
            placeholder="One constraint per line"
          />
        </div>

        <div className="field-group">
          <label htmlFor={attachmentsId}>Reference attachments</label>
          <input id={attachmentsId} name="attachments" type="file" multiple />
          <p id="intake-note" className="trust-note">
            Attachments, image text, links, and repository instructions are untrusted data. Files
            must pass configured safety scanning before normalization.
          </p>
        </div>

        <button className="primary-action form-action" type="submit">
          Prepare requirement review
        </button>
      </form>

      <section className="review-panel" aria-labelledby="review-title" aria-live="polite">
        <p className="eyebrow">Review gate</p>
        <h2 id="review-title">Requirement draft</h2>
        {review === undefined ? (
          <p className="review-empty">
            Complete intake to expose assumptions, scope, and acceptance criteria before execution.
          </p>
        ) : (
          <div className="review-content">
            <div className="review-meta">
              <span>{review.mode}</span>
              <span>{review.target}</span>
            </div>
            <h3>Original intent</h3>
            <p>{review.prompt}</p>
            <h3>Assumptions to confirm</h3>
            <ul>
              <li>Existing navigation and brand behavior remain unless explicitly changed.</li>
              <li>No production action occurs from this review.</li>
            </ul>
            <h3>Acceptance criteria</h3>
            <ul>
              <li>The requested outcome is visible in an authorized preview.</li>
              <li>Keyboard and screen-reader behavior pass configured accessibility checks.</li>
            </ul>
            <h3>Constraints</h3>
            <p>
              {review.constraints.length > 0
                ? review.constraints.join(' / ')
                : 'No additional constraints supplied.'}
            </p>
            <h3>Attachments</h3>
            <p>
              {review.attachmentNames.length > 0
                ? `${review.attachmentNames.length} pending safety scan`
                : 'None supplied.'}
            </p>
            <p className="review-warning">
              This browser draft is not execution authority. Authenticated persistence and policy
              gates remain required.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function formString(data: FormData, name: string, fallback = ''): string {
  const value = data.get(name)
  return typeof value === 'string' ? value : fallback
}
