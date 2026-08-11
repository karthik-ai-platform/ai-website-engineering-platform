import type { Metadata } from 'next'

import { ChangeRequestForm } from './change-request-form'

export const metadata: Metadata = { title: 'New change request' }

export default function NewChangeRequestPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="AI Website Engineering Platform home">
          <span className="wordmark-mark" aria-hidden="true">
            AWE
          </span>
          <span>Engineering Control Plane</span>
        </a>
        <div className="environment-chip">
          <span className="environment-dot" aria-hidden="true" />
          M06 intake
        </div>
      </header>
      <main id="main-content" className="shell change-shell">
        <section className="change-intro" aria-labelledby="page-title">
          <p className="eyebrow">Prompt and requirements</p>
          <h1 id="page-title">Frame the change before execution.</h1>
          <p className="hero-copy">
            Capture immutable intent, choose the engineering mode, disclose constraints, and review
            assumptions before any plan or model-backed action.
          </p>
        </section>
        <ChangeRequestForm />
      </main>
      <footer className="site-footer">
        <span>AI Website Engineering Platform</span>
        <span className="mono">SRS v1.1 - M06</span>
      </footer>
    </>
  )
}
