const foundationChecks = [
  {
    id: 'control-plane',
    label: 'Control plane',
    detail: 'Typed Fastify boundary with authenticated application routes.',
    state: 'Building',
  },
  {
    id: 'workflow',
    label: 'Workflow authority',
    detail: 'Deterministic state transitions; durable engine selection remains gated.',
    state: 'Building',
  },
  {
    id: 'cost-controller',
    label: 'AI Cost Controller',
    detail: 'Mandatory route for every future model request.',
    state: 'Required',
  },
] as const

export default function HomePage() {
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
          Foundation
        </div>
      </header>

      <main id="main-content" className="shell">
        <section className="hero" aria-labelledby="page-title">
          <p className="eyebrow">Milestone M01 - in progress</p>
          <h1 id="page-title">Software delivery with evidence, authority, and cost control.</h1>
          <p className="hero-copy">
            The platform turns intent into governed website changes. Every future mutation will be
            planned, isolated, validated, versioned, reviewable, and reversible.
          </p>
          <div className="hero-actions" aria-label="Foundation resources">
            <a className="primary-action" href="/api/health">
              Inspect web health
            </a>
            <a className="secondary-action" href="#foundation-status">
              View foundation status
            </a>
          </div>
        </section>

        <section id="foundation-status" className="status-section" aria-labelledby="status-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">System boundaries</p>
              <h2 id="status-title">Foundation status</h2>
            </div>
            <p className="section-note">Status is implementation evidence, never model prose.</p>
          </div>

          <div className="status-grid">
            {foundationChecks.map((check) => (
              <article className="status-card" key={check.id}>
                <div className="status-card-heading">
                  <h3>{check.label}</h3>
                  <span className="status-badge">{check.state}</span>
                </div>
                <p>{check.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="guardrail" aria-labelledby="guardrail-title">
          <span className="guardrail-icon" aria-hidden="true">
            01
          </span>
          <div>
            <h2 id="guardrail-title">Production promotion is disabled by default.</h2>
            <p>
              Privileged actions require typed policy decisions, current authorization, immutable
              commit evidence, and the configured approval gate.
            </p>
          </div>
        </aside>
      </main>

      <footer className="site-footer">
        <span>AI Website Engineering Platform</span>
        <span className="mono">SRS v1.1 - M01</span>
      </footer>
    </>
  )
}
