# Continuation Prompt

You are the principal engineer continuing implementation of the AI Website Engineering Platform in:

`C:\Users\HP\Desktop\ai-website-engineering-platform`

Current branch: `codex/m01-foundation`  
Latest recorded commit: `8064bd6c2017386404ac6a7818828629c1471dd6` (`feat(M01): initialize platform foundation [codex]`)
Completed milestones: none  
Current milestone: **M01 Foundation - in progress**

Begin by reading, in order:

1. `AGENTS.md`.
2. `docs/product/AI_Website_Engineering_Platform_SRS_v1.1_AI_Cost_Controller.pdf` (authoritative).
3. `docs/product/SRS_EXTRACTED.md` (searchable companion only; resolve ambiguity against the PDF).
4. `docs/IMPLEMENTATION_PLAN.md`.
5. `docs/IMPLEMENTATION_STATUS.md`.
6. `docs/DECISIONS.md`.
7. `docs/SESSION_HANDOFF.md`.

Then inspect Git state before editing. Preserve all useful or concurrent work.

## Current exact checkpoint

M01 foundation implementation is committed locally. Do not repeat bootstrap work. Local M01 validation is stable: high dependency audit, runtime health, production build, browser checks, accessibility checks, tests, secret scan, and whitespace checks pass. M01 is not marked complete because live PostgreSQL migration validation is skipped locally and GitHub CI has not run.

## Implemented M01 capabilities

- Strict npm-workspaces TypeScript monorepo.
- Next.js 16.3.0 App Router management app with M01 health route and accessible foundation page.
- Fastify control-plane API with liveness/readiness/session routes, typed errors, redacted structured logging, OIDC/local auth adapters, production database requirement, production HTTPS OIDC enforcement, and loopback-only local header auth.
- Separate worker health/lifecycle boundary.
- Versioned contracts for auth, health, errors, workflow commands, and workflow events, including tenant/project/payload/integrity event metadata.
- Domain error/authentication/run-state logic independent of web/database frameworks.
- PostgreSQL/Drizzle tenant/audit schema and forward migration with purpose/recovery notes and append-only audit triggers.
- PGlite migration compatibility tests for tables, UUID defaults, tenant FK, UPDATE/DELETE/TRUNCATE denial, and migration journal re-run.
- Playwright/axe browser and accessibility validation gate through `npm run test:browser`.
- CI/dependabot, formatting, linting, typecheck, unit/contract/integration tests, build, dependency audit, and secret scan scripts.

## Architectural decisions already made

- ADR-001 through ADR-008 remain active.
- ADR-009: M01 production web build uses `next build --webpack`; dev remains `next dev --turbopack`.
- ADR-010: Next.js 16.3.0 resolves the high dependency audit findings from Next's optional dependency metadata, and Playwright/axe provide the repository-owned browser/accessibility gate.
- Do not call any LLM provider directly; all future model calls must pass through the AI Cost Controller.
- Durable workflow engine selection remains deferred; do not represent an in-memory process as durable.

## Commands already run and outcomes

- `npm ci` -> passed; npm reported 4 moderate vulnerabilities.
- `npm ls --omit=dev --all` -> exited 0, with optional dependency gaps and extraneous WASM helper packages reported by npm.
- `npm run validate` -> passed.
- `npm run format:check` -> passed.
- `npm run lint` -> passed; Next App Router pages-directory notice printed.
- `npm run typecheck` -> passed 7/7 packages.
- `npm run test:unit` -> passed 9 files / 28 tests.
- `npm run test:contract` -> passed 1 file / 6 tests.
- `npm run test:integration` -> passed 3 files / 13 tests; 1 file / 1 live PostgreSQL test skipped.
- `npm run db:migrate:check` -> passed 1 file / 5 tests.
- `npm run db:migrate:integration` -> skipped 1 live PostgreSQL test because disposable PostgreSQL env vars are unset.
- `npm run build` -> passed 7/7 packages using `next build --webpack`.
- `npm run test:browser` -> passed 3 Playwright tests, including content/no-overlay checks, health contract, and axe WCAG A/AA scan.
- Runtime health verification -> passed: API `/health/live` 200, API `/health/ready` 200 with database check disabled locally, worker `/health/live` 200, and web `/api/health` 200.
- `npm run security:secrets` -> passed, 101 text files scanned.
- `npm run security:deps` -> passed at high threshold; 4 moderate `esbuild` advisories remain through `drizzle-kit`.
- `git diff --check` -> passed.

## Known failures and limitations

- Live PostgreSQL migration validation is skipped until a safe disposable endpoint is available. Required env: `DATABASE_MIGRATION_TEST_URL` and `DATABASE_MIGRATION_TEST_ACKNOWLEDGE_DISPOSABLE=1`.
- GitHub CI has not run because M01 has not been pushed. `gh auth status` reports an invalid token for `karthik18mohan`.
- Do not run `npm audit fix --force`; it proposes a breaking `drizzle-kit` downgrade for moderate `esbuild` advisories.
- Vercel preview is not attempted; M12 has not been reached and production deployment is not authorized.

## Next exact implementation tasks

1. Re-run `git status --short --branch` and verify no concurrent work appeared.
2. If a safe disposable PostgreSQL URL is available, run `npm run db:migrate:integration` with `DATABASE_MIGRATION_TEST_URL` and `DATABASE_MIGRATION_TEST_ACKNOWLEDGE_DISPOSABLE=1`.
3. If any files change, re-run final validation: `npm ci`, `npm ls --omit=dev --all`, `npm run validate`, `npm run db:migrate:integration`, and `git diff --check`.
4. Read the `github:yeet` skill before committing/pushing.
5. If the local PostgreSQL skip is accepted as a local-session limitation or live PostgreSQL passes, commit with `feat(M01): initialize platform foundation [codex]`, push `codex/m01-foundation`, and capture GitHub CI.
6. Do not mark M01 complete until live PostgreSQL evidence or accepted limitation and GitHub CI evidence are recorded in `docs/IMPLEMENTATION_STATUS.md`.

## Restrictions

Never force-push or push directly to `main`. Never merge autonomously. Do not production-deploy or modify production domains, DNS, or secrets. Vercel preview deployments must use the exact committed tested SHA and are not part of M01. Keep tenant scoping throughout, audit events append-only, callbacks authenticated/deduplicated/replay-safe, external/model boundaries schema-validated, and privileged transitions deterministic. Every model request must be estimated, budget-checked, routed, metered, and reconciled by the AI Cost Controller.
