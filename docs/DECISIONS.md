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

## ADR-011 - M02 deny-by-default RBAC and retention-aware project lifecycle

- **Status:** Accepted
- **Date:** 2026-08-11
- **Milestone:** M02
- **Context:** The SRS requires explicit human roles, separately scoped service identities, distinct privileged permissions, tenant isolation, authorization at issue and delayed execution, append-only audit, and project deletion subject to retention. Delegated approvals and environment-specific production authority remain open production-policy decisions.
- **Decision:** Keep authorization and lifecycle rules in the framework-independent domain. Human role defaults are conservative: Owner receives all M02 permissions; Developer and Designer can read/request changes; Reviewer can read/approve; Viewer is read-only. Merge, promotion, secret, policy, member, and lifecycle permissions default to Owner until a later versioned policy explicitly delegates them. Service identities never inherit human roles and receive enumerated organization/project-scoped grants. Every project command appends an allowed or denied authorization event; successful mutations append a second event atomically with the project write. Delete becomes `deletion_pending` until the referenced policy retention window expires, or `deleted` immediately only when that window is zero. Delayed lifecycle commands re-read current membership/grants and may use `expectedUpdatedAt` to reject stale project state.
- **Alternatives considered:** Broad role defaults based on informal persona descriptions; treating service identities as users; immediate hard deletion; UI-only permission enforcement; coupling policy logic to Fastify or Drizzle.
- **Consequences:** Least privilege is the default and delegation must be explicit. M02 APIs remain provider-neutral and storage-independent at the domain boundary. Physical deletion processing after retention is deferred to later durable workflow/retention work and cannot erase audit history.

## ADR-012 - M03 provider-neutral boundaries and mandatory model gateway

- **Status:** Accepted
- **Date:** 2026-08-11
- **Milestone:** M03
- **Context:** The SRS requires replaceable Git, deployment, secrets, artifact, runner, orchestration, and model integrations; secrets referenced rather than persisted; authenticated, deduplicated, replay-safe callbacks; deterministic test doubles; and an AI Cost Controller decision before every model invocation.
- **Decision:** Define versioned provider schemas in `@platform/contracts` and framework-independent provider ports in `@platform/domain`. Export deterministic local mocks and callback safety primitives from `@platform/provider-framework`. Application code may invoke models only through `AiCostControllerPort`; the raw model adapter interface remains internal and unexported, with ESLint restrictions preventing application/domain imports of raw model SDKs or that internal module. The initial controller mock denies every request until the minimum M17 estimate, budget, routing, usage, and reconciliation path is implemented.
- **Alternatives considered:** Exposing raw model providers to application code; allowing vendor SDK types across domain boundaries; storing plaintext provider tokens; accepting unauthenticated callbacks; choosing production vendors before contract conformance exists.
- **Consequences:** M03 conformance remains deterministic and credential-free, provider outages are represented as typed results, and no live model invocation is possible through the public framework. Production adapters and the complete M17 controller remain later work; the minimum controller path must precede M06's first model-assisted behavior.

## ADR-013 - M04 installation-first GitHub onboarding remains read-only

- **Status:** Accepted
- **Date:** 2026-08-11
- **Milestone:** M04
- **Context:** GitHub onboarding must prove current project authority, selected-installation repository access, least privilege, exact repository identity/default branch/commit, credential non-disclosure, and authenticated replay-safe webhooks without prematurely authorizing the later Git write path.
- **Decision:** Introduce `repository:connect` as a distinct Owner-by-default permission rather than reusing `git:merge`. Initiation requires an active project, a current authorization decision, and an existing GitHub App credential reference. Persist only a ten-minute SHA-256 state digest bound to actor/tenant/project; consume it once and reauthorize completion. Mark readiness `ready` only when the selected installation reports matching IDs plus Metadata and Contents read access at an exact 40-character commit. Persist the opaque credential reference internally but omit it from API readiness responses. Keep `mutationEnabled=false` in contracts and database constraints. Authenticate GitHub raw webhook bytes with HMAC before resolving installation/repository identity to trusted tenant/project context; deduplicate deliveries before an application-owned refresh callback.
- **Alternatives considered:** Personal access tokens; user OAuth as repository authority; all-repository installations by default; trusting callback tenant/project parameters; storing raw setup state; returning secret references to clients; enabling pull-request or content mutation during onboarding.
- **Consequences:** Deterministic fixture onboarding can satisfy M04 contract evidence without credentials, while live-provider evidence requires the explicit owner setup in `docs/runbooks/github-app-onboarding.md`. M11 must perform a separate least-privilege review before any Git write scope is enabled. Lost access remains visible as `access_lost`; the platform never falls back to broader credentials.

## ADR-014 - M05 deterministic repository evidence precedes semantic retrieval

- **Status:** Accepted
- **Date:** 2026-08-11
- **Milestone:** M05
- **Context:** Repository context must be narrow, reproducible, tenant-isolated, commit-addressed, provenance-linked, token-bounded, and secret-safe. Semantic similarity can improve recall but cannot replace current source truth or deterministic dependency/symbol evidence.
- **Decision:** Key every index by organization, project, repository, immutable commit, and configuration digest. Normalize/sort provider file paths before hashing. Exclude generated, vendor, binary, oversized, policy, filename-secret, and content-secret candidates before metadata extraction. Derive language/category, framework/package manager/scripts, routes, exports/imports, symbols/components/stories/tests, configuration/instructions, ownership, and recent commit summaries deterministically. Use lexical path/content, symbol, dependency, instruction, and test evidence by default; expose semantic search only as an optional provider-neutral score port. Retrieval emits bounded excerpts through the artifact port and a manifest with source path, commit, content/configuration digests, score, and estimated tokens. Invalidation may remove only stale entries in the addressed tenant/project.
- **Alternatives considered:** Sending the full repository; semantic/vector retrieval as the first or only selector; cache keys without tenant/configuration scope; indexing ignored binaries/vendor/generated output; retaining detected secret content for later redaction; model-generated repository maps.
- **Consequences:** Golden fixture maps and retrieval manifests are deterministic and credential-free. Secret candidates never enter searchable documents or context artifacts. The included memory index store is a conformance/test adapter; a production durable index/artifact implementation remains provider configuration and must preserve the same scoped contracts. Retrieved repository instructions remain untrusted data and cannot supersede platform policy.

## ADR-015 - M06 immutable intake and reviewable requirement boundary

- **Status:** Accepted
- **Date:** 2026-08-11
- **Milestone:** M06
- **Context:** FR-004 and FR-005 require immutable prompt intake and typed, reviewable requirements while repository, web, image, and attachment text remain untrusted. The full AI Cost Controller is not yet available, so no live model-backed normalization may be implied or invoked.
- **Decision:** Persist the actor-attributed original prompt, mode, target, constraints, and explicitly trust-labeled attachment references as the immutable ChangeRequest. Re-scan attachment metadata through an application-supplied scanner before normalization. Accept Requirement role results only through a high-level domain port, schema-validate them, permit exactly one retry, and require complete estimate/budget/routing/pricing/usage evidence for any result labeled model-backed. Deterministic fixtures are labeled separately and cannot claim provider evidence. Human corrections create a new RequirementSpec revision and never overwrite the original prompt.
- **Alternatives considered:** Letting clients declare attachments clean; editing the original prompt during clarification; accepting prose-only requirements; allowing unmetered model calls before M17; silently retrying malformed output without a bound.
- **Consequences:** The initial M06 contract/domain slice is testable without credentials or model calls, all eight SRS modes share one strict schema, and later API/database/UI adapters must preserve revision and trust boundaries. Model-backed M06 acceptance remains blocked until the minimum M17 controller path exists.

## ADR-016 - M07 deterministic risk and immutable approval evidence

- **Status:** Accepted
- **Date:** 2026-08-11
- **Milestone:** M07
- **Context:** FR-006 and FR-007 require a versioned execution plan, deterministic risk classification, current project/environment policy, and an authorized approval pause before high-risk mutation. The SRS also prohibits model prose from controlling privileged transitions and forbids automatic relaxation after a security or policy failure.
- **Decision:** Treat planner output as typed advisory data, then derive risk class, required architecture/UI/security analyses, requested approval gates, and the initial execution gate through deterministic domain policy. Each required specialized analysis must be schema-valid and completed, contain role-specific evidence, and match the requirement, immutable base commit, and policy snapshot digest before the plan can leave `PLANNING`; malformed output receives one bounded retry, while incomplete AI Cost Controller evidence stops immediately. Persist immutable, revisioned plans with the exact policy snapshot and base commit. Persist runs behind the existing orchestrator-only state machine and enforce the same transition graph in PostgreSQL. Approval requests are tenant-scoped and idempotent; a pending request may receive one attributed approved/rejected decision, after which it is final. Stale plan revision, analysis binding, or policy-version evidence never opens the execution gate, separation of duties is explicit in the snapshot, and blocked policy results remain rejected even if supplied approval-shaped input.
- **Alternatives considered:** Letting a model assign authoritative risk; mutable in-place plans; UI-only approval checks; accepting stale approvals after plan/policy changes; permitting high-risk workspace preparation before approval; retrying or relaxing blocked policy results.
- **Consequences:** M07 can prove with deterministic fixtures that high-risk work reaches `AWAITING_APPROVAL` before any workspace callback. The initial policy matrix is conservative and provider-neutral; environment-specific production delegation remains an explicit production decision. API/store orchestration must append audit events for requested, allowed, denied, approved, rejected, and blocked outcomes without weakening the database constraints.

## ADR-017 - M08 runner contract and isolation claim boundary

- **Status:** Accepted
- **Date:** 2026-08-11
- **Milestone:** M08
- **Context:** FR-008 and NFR-005 require every mutating run to use an ephemeral, resource-limited workspace based on an immutable commit, while the threat model requires sandboxing, egress policy, command/tool allowlists, approved registries, install-script policy, tenant isolation, digest artifacts, cancellation, and cleanup. The M03 runner seam accepted a raw command string and its mock returned an exit code without checkout, profile, or isolation evidence; retaining that shape would create a bypass and overstate conformance.
- **Decision:** Supersede the raw runner command/result with one versioned lifecycle boundary: provision an immutable tenant/run/plan/base-commit workspace under an exact isolation profile; execute shell-free executable-plus-argv commands bound to the workspace and canonical profile digest; cancel idempotently; and destroy idempotently. Profiles explicitly snapshot image digest, CPU/memory/time/process/file limits, host-filesystem denial and writable roots, network deny/allowlist policy, command allowlist, approved registries and install-script policy, production-secret denial, and artifact limits. Deterministic domain policy rejects stale scope/commit/profile bindings, unlisted commands, excessive time, filesystem escape, and artifact-policy mismatch. The included `ConformanceRunnerFixture` never checks out code or starts a process, labels all evidence `conformance_fixture`/`simulated_conformance`, and refuses a `production_isolation` profile.
- **Alternatives considered:** Retaining a raw shell-command adapter; treating a host-process mock as isolation; choosing Docker, microVM, Kubernetes, or a hosted sandbox before owner/runtime approval; trusting caller-provided profile digests; replaying conflicting command IDs; allowing implicit network, host filesystem, install scripts, or production secrets.
- **Consequences:** M08 has a strict provider-neutral seam and malicious-input conformance evidence without executing untrusted code. A production isolation runtime, supported runner image/profile matrix, real immutable checkout, resource enforcement, artifact capture, and host-boundary security suite remain required before M08 completion. No production-isolation or runner-security acceptance claim may cite the conformance fixture.

## ADR-018 - M08 delayed runner authorization and durable evidence ownership

- **Status:** Accepted
- **Date:** 2026-08-11
- **Milestone:** M08
- **Context:** A queued plan may become stale before a worker provisions its workspace. The SRS requires authorization at command issue and delayed privileged execution, current approval/policy enforcement, durable run state, idempotent mutating commands, append-only audit, tenant isolation, and digest-addressed large evidence. Persisting argv or raw process output would also create an avoidable secret-retention path.
- **Decision:** Add a service-only `run:execute` permission that no human role receives by default. The framework-independent runner orchestration service re-reads the scoped service grant, exact queued run, current plan approvals, current policy version, repository readiness, repository identity, immutable base commit, and isolation-profile binding before calling `provision`. It schema-validates every runner response and alone owns deterministic run transitions for execution, cancellation, and cleanup. The separately deployable worker owns the PostgreSQL adapter. Workspace, command, artifact-reference, cancellation, and cleanup records use tenant-scoped foreign keys and replay digests; command persistence deliberately omits argv, environment, raw stdout/stderr, and secret values. Runner evidence is append-only, while workspace state may only move forward from ready to cancelled/destroyed.
- **Alternatives considered:** Reusing `change:request` for worker execution; granting human owners direct runner authority; trusting the approval state captured when work was queued; invoking the runner port directly from API code; storing raw process output in PostgreSQL; keeping lifecycle evidence only in memory; placing worker persistence behind control-plane application modules.
- **Consequences:** Delayed execution now fails closed on revoked service access, stale approval/policy/repository evidence, cross-tenant scope, and binding mismatch. Replays are durable without retaining command contents or raw output. The worker remains independently deployable and imports only shared contracts/domain/database packages. A production isolation adapter, approved image/profile matrix, real checkout and artifact providers, durable dispatch engine, and forbidden-host-resource acceptance suite remain required before M08 completion.

## ADR-019 - M08 Vercel Sandbox production-isolation adapter

- **Status:** Accepted for implementation; live provider acceptance pending
- **Date:** 2026-08-16
- **Milestone:** M08
- **Context:** The production runner must provide a stronger boundary than a host process or ordinary container, enforce resource and deny-by-default network policy, use an immutable approved image, support cancellation and cleanup, and remain behind the provider-neutral runner lifecycle. The repository already targets Vercel for later preview deployment, but no Vercel project, OIDC identity, hardened runner image, or production credentials are configured in this checkout.
- **Decision:** Implement the first production adapter with the GA `@vercel/sandbox` SDK pinned to 3.0.0 and keep it in the separate `@platform/vercel-sandbox-runner` package. An approved versioned manifest must bind the runner profile to an exact custom-image SHA-256 digest and attest host-filesystem denial, absence of production secrets, removal of sudo, the fixed command broker, process/file/byte controls, and install-script policy. Planner output is non-persistent, exposes no inbound ports or environment variables, permits only supported whole-vCPU values with the provider's fixed 2048 MiB-per-vCPU coupling, and maps network denial or an HTTPS-only domain allowlist. After creation, the adapter must compare provider-reported image, resources, timeout, persistence, status, expiry, and network policy against the authorized plan; it stops and rejects any mismatch.
- **Alternatives considered:** Self-managed Firecracker microVMs, which preserve control but add substantial image, kernel, network, scheduling, patching, and incident-response burden; Kubernetes/gVisor or ordinary containers, which require a separate hosting and hardening program and do not by themselves establish the required host-resource boundary; deferring all implementation until credentials and a live provider project exist, which would leave the validated provider-neutral seam without a production adapter shape.
- **Consequences:** The code now has a strict manifest/planning/creation-verification boundary without making a live provider call or claiming M08 completion. Live acceptance still requires an organization-approved non-production Vercel project and region/data terms, OIDC or scoped credentials, a published hardened image digest, immutable repository checkout and short-lived credential brokering, broker-enforced process/filesystem/disk controls, digest artifact capture, durable worker wiring, cancellation/cleanup exercises, and the forbidden-host-resource security suite. The SDK's domain network policy does not model per-destination ports, so the initial profile matrix accepts allowlisted destinations only when their contract ports are HTTPS 443; image and command-broker controls must enforce the same restriction.
- **Primary references reviewed:** Vercel Sandbox documentation (https://vercel.com/docs/sandbox), product isolation description (https://vercel.com/sandbox), and egress firewall announcement (https://vercel.com/changelog/advanced-egress-firewall-filtering-for-vercel-sandbox), reviewed 2026-08-16.

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
