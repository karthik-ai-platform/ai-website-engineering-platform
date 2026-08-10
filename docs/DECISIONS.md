# Architecture Decision Log

This file records decisions for the AI Website Engineering Platform. The authoritative specification is `docs/product/AI_Website_Engineering_Platform_SRS_v1.1_AI_Cost_Controller.pdf`. Decisions that merely select an allowed implementation do not supersede the SRS. Any future decision that changes a mandatory requirement must state that explicitly, identify the affected requirements, and obtain the required review.

Status values: **Accepted**, **Proposed**, **Deferred**, **Superseded**, **Rejected**.

## ADR-001 - npm workspaces for the TypeScript monorepo

- **Status:** Accepted
- **Date:** 2026-07-21
- **Milestone:** M01
- **Context:** The SRS recommends a TypeScript-first monorepo with shared contracts and provider adapters. The audited environment has Node.js/npm available; the foundation should avoid unnecessary orchestration dependencies.
- **Decision:** Use npm workspaces with pinned package-manager metadata and root scripts that coordinate apps, packages, tests, and migrations. Keep package boundaries explicit and forbid framework/provider dependencies in domain packages.
- **Alternatives considered:** pnpm workspaces, Yarn workspaces, Turborepo layered over a package manager.
- **Consequences:** Lowest bootstrap complexity and no additional package-manager prerequisite. Revisit build caching only when repository size and CI measurements justify it.

## ADR-002 - modular control-plane monolith with a separate worker boundary

- **Status:** Accepted
- **Date:** 2026-07-21
- **Milestone:** M01
- **Context:** SRS sections 5 and 16 recommend a modular monolith for control-plane APIs while untrusted execution runs separately. The product still requires durable state and independently scalable workers.
- **Decision:** Keep authentication, RBAC, project metadata, policy, run commands, provider coordination, and cost-control application services in one modular control-plane deployment initially. Define the worker as a separately deployable process/package with versioned commands/events and no implicit in-process authority. Isolated build workspaces remain a further boundary behind the runner interface.
- **Alternatives considered:** Independent service per domain from inception; a single process containing both API and untrusted execution.
- **Consequences:** Fewer initial operational failure modes while retaining extraction seams. Untrusted code never executes inside the web or API process.

## ADR-003 - PostgreSQL-compatible relational persistence through Drizzle

- **Status:** Accepted for the production profile; local execution prerequisite unresolved
- **Date:** 2026-07-21
- **Milestone:** M01
- **Context:** The SRS makes the relational database authoritative for orchestration metadata, approvals, memories, audit references, and costs, requires migrations and tenant scoping, and names PostgreSQL compatibility in the implementation objective. The environment audit did not find Docker, `psql`, or a local PostgreSQL service/toolchain.
- **Decision:** Target PostgreSQL and use Drizzle ORM/Drizzle Kit for typed schema definitions and forward migrations. Domain services depend on repository ports, not Drizzle. Every tenant-owned table carries organization/project scope as applicable; audit records are append-only by service and database controls. No fallback database is represented as production-equivalent.
- **Alternatives considered:** Prisma, Kysely plus a separate migration tool, raw SQL, SQLite as the primary local/production profile.
- **Consequences:** Database-backed integration and migration execution require a PostgreSQL endpoint or later installation of approved local tooling. Schema generation/static validation and repository-level tests can proceed first. Each migration must document purpose and recovery; non-local destructive reset is forbidden.

## ADR-004 - Fastify for the TypeScript control-plane API

- **Status:** Accepted
- **Date:** 2026-07-21
- **Milestone:** M01
- **Context:** The API requires clear lifecycle handling, structured logging, health endpoints, versioned validation, and a framework-independent domain. It must remain separately operable from the Next.js UI.
- **Decision:** Use Fastify for the API transport and composition root. Translate versioned contract schemas at the boundary and call application/domain services through ports. No domain rule may rely on Fastify request objects or plugins.
- **Alternatives considered:** Next.js route handlers as the entire control plane, Express, Hono, NestJS.
- **Consequences:** The control plane is independently testable/deployable and remains a modular monolith. It adds a dedicated app but avoids coupling long-running workflow commands to the web UI runtime.

## ADR-005 - Next.js App Router for the management application

- **Status:** Accepted
- **Date:** 2026-07-21
- **Milestone:** M01
- **Context:** The first production profile requires a Next.js management application and the SRS calls for an accessible project workspace, dashboards, history, deployments, settings, and audit views.
- **Decision:** Use Next.js App Router with strict TypeScript. UI code consumes typed API clients/application view models and never accesses the database directly. Accessibility targets WCAG 2.2 AA practices and keyboard-first workflows.
- **Alternatives considered:** Pages Router, a standalone Vite SPA, combining all control-plane behavior into Server Actions.
- **Consequences:** Server/client boundaries must be deliberate, and privileged changes continue through the control-plane API/policy boundary rather than UI-only checks.

## ADR-006 - provider-neutral ports and versioned adapters

- **Status:** Accepted
- **Date:** 2026-07-21
- **Milestones:** M03, M04, M12, M17
- **Context:** The SRS forbids direct model-provider calls outside the AI Cost Controller and requires replaceable Git, deployment, model, secrets, artifacts, and runner integrations.
- **Decision:** Define versioned contracts and domain-facing ports before vendor implementations. GitHub App, Vercel, and each LLM provider live in adapters. All model calls enter a single AI Cost Controller gateway that produces a routing decision, pricing version, estimate/budget decision, context manifest, usage record, and actual-cost reconciliation. Mock adapters must pass the same contract suite as real adapters.
- **Alternatives considered:** Vendor SDK types crossing application boundaries; direct provider calls from agents or UI; a generic untyped provider wrapper.
- **Consequences:** Some up-front contract work is required, but provider credentials and model IDs remain configuration rather than business logic. No adapter may advance workflow state on its own.

## ADR-007 - durable workflow engine selection follows an explicit benchmark

- **Status:** Deferred; port-first implementation is accepted
- **Date:** 2026-07-21
- **Milestones:** M01 design seam, decision required before M08/M19 production completion
- **Context:** The SRS requires durable state, retries, timeouts, compensation, approvals, cancellation, replay-safe events, and recovery after worker/process failure. Appendix B leaves engine and hosting topology open. Choosing an engine before confirming operational and deployment constraints would create avoidable lock-in.
- **Decision:** Define a provider-neutral orchestration port, deterministic run state machine, versioned commands/events, idempotency keys, and persistence semantics first. Do not call an in-memory queue durable. Benchmark viable engines/topologies before selecting the production implementation.
- **Benchmark gates:** PostgreSQL compatibility and transaction semantics; durable timers and human approval waits; cancellation and compensation; deterministic/replay behavior; duplicate/out-of-order delivery handling; local development without unsafe fallbacks; worker isolation/scaling; TypeScript support; Vercel/control-plane topology compatibility; observability; operational burden; licensing and cost.
- **Alternatives to benchmark:** Temporal, a PostgreSQL-backed workflow/queue implementation, and hosted TypeScript workflow products that satisfy the mandatory gates. Inclusion is evaluation, not approval.
- **Consequences:** M01 can implement contracts and state-machine tests. M08/M19 cannot be called production-complete until benchmark evidence, an accepted follow-up ADR, failure-injection tests, and operational runbooks exist.

## ADR-008 - SRS version-header anomaly handling

- **Status:** Accepted as an interpretation record; product-owner confirmation pending
- **Date:** 2026-07-21
- **Context:** The filename, cover document-control table, and revision history identify SRS version 1.1 and describe the AI Cost Controller integration, but repeated page headers display v1.0.
- **Decision:** Treat the document-control/revision-history version 1.1 and its full contents as authoritative. Do not modify the source PDF. Record the anomaly as an external clarification item and do not omit AI Cost Controller requirements.
- **Consequences:** Implementation proceeds against v1.1 without waiting, while formal confirmation remains tracked.

## ADR-009 - Next.js production build uses webpack for M01

- **Status:** Accepted
- **Date:** 2026-07-22
- **Milestone:** M01
- **Context:** Next.js 16.2.11 defaults production builds to Turbopack. In this npm workspace, the web app can follow TypeScript source aliases into `packages/contracts/src`; Turbopack then fails to resolve ESM `.js` specifiers that TypeScript and Vitest resolve to `.ts` source files. The same app builds successfully with Next's webpack production builder.
- **Decision:** Use `next build --webpack` for the M01 production build while keeping `next dev --turbopack` for local development. Internal packages build with `tsc` and expose ESM output through package exports.
- **Alternatives considered:** Commit generated `.js` stubs into package source directories; remove ESM `.js` specifiers from TypeScript source; adopt a canary Next/Turbopack behavior; bundle all internal packages with tsup. These either weakened source hygiene, risked Node ESM runtime behavior, or failed in the Windows sandbox.
- **Consequences:** Production build is stable and reproducible on the current toolchain. Re-evaluate Turbopack once it handles this workspace ESM resolution path or the package build strategy changes.

## ADR-010 - M01 dependency-audit remediation and browser validation gate

- **Status:** Accepted
- **Date:** 2026-08-10
- **Milestone:** M01
- **Context:** The M01 dependency audit failed at `--audit-level=high` because Next.js 16.2.11 pulled vulnerable optional `sharp`/`postcss` metadata. The mandatory browser/accessibility verification gate also lacked a reproducible repository-owned harness, and the environment-provided `agent-browser` CLI was unavailable.
- **Decision:** Upgrade the web workspace and Next lint integration to Next.js 16.3.0, which resolves the high-severity `sharp`/`postcss` audit findings while preserving React 19.2.8. Add Playwright plus axe as a root dev-only browser/accessibility gate and run it through a small cross-platform script that starts the production-built web app, waits for `/api/health`, executes the tests, and terminates the exact spawned process tree.
- **Alternatives considered:** `npm audit fix --force`, which proposed breaking downgrades; a direct `sharp` override, which did not remove the nested vulnerable Next dependency; relying on the unavailable environment `agent-browser` CLI; recording a permanent audit exception.
- **Consequences:** `npm run security:deps` now exits 0 with only moderate `esbuild` advisories through `drizzle-kit`; browser/accessibility validation is reproducible locally and in CI. CI installs Chromium with `npx playwright install --with-deps chromium`.

## Open production decisions

These are not blockers to contract-first/local implementation but must be resolved before their production acceptance gates:

- Durable workflow engine and hosting topology (ADR-007).
- Organization-approved AI providers, data terms, regions, and retention.
- Production secrets manager, artifact store, PostgreSQL service, and observability stack.
- Supported framework/version matrix and runner images.
- Environment-specific approval/separation-of-duties matrix and whether all single-user changes require PRs.
- Service objectives, retention windows, backup frequency, and restore-test cadence.
- Generated-site production database migration policy.
- Security, dependency, secret, and license scanners.
- Model evaluation suite and pilot benchmark repositories.
