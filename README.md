# AI Website Engineering Platform

Governed, cost-aware software delivery from natural-language intent to reviewed website
changes. The platform is being implemented milestone-by-milestone from the authoritative
[SRS v1.1](docs/product/AI_Website_Engineering_Platform_SRS_v1.1_AI_Cost_Controller.pdf).

## Current status

M01 Foundation is in progress. Consult:

- `docs/IMPLEMENTATION_STATUS.md` for verified progress and exact evidence.
- `docs/IMPLEMENTATION_PLAN.md` for the M01-M20 requirement map.
- `docs/DECISIONS.md` for accepted architecture choices and unresolved production decisions.
- `docs/SESSION_HANDOFF.md` for the current continuation point.

No production deployment is authorized. The management UI, control-plane API, worker,
provider adapters, and AI Cost Controller are developed behind explicit typed boundaries.

## Repository profile

- Node.js 22 and npm workspaces
- Strict TypeScript
- Next.js App Router management application
- Fastify control-plane API
- Separate worker/runtime boundary
- PostgreSQL-compatible persistence with Drizzle migrations
- Provider-neutral integration contracts

## Local setup

1. Install Node.js 22 and npm 10.
2. Run `npm ci` after the lockfile exists.
3. Copy `.env.example` to `.env.local` at the repository root and use development-only values.
   The API and worker scripts load that file locally with Node's `--env-file-if-exists` flag.
   When the web app needs public runtime variables, place them in `apps/web/.env.local` because
   Next.js resolves app-scoped env files from the app directory.
4. Run `npm run dev` for the application processes.

Production credentials must be supplied through an approved secrets manager. Do not commit
environment files, provider tokens, or unrestricted prompts/source.

## Validation

The root validation entry point is `npm run validate`. Individual scripts cover formatting,
lint, strict type checking, unit/integration/contract tests, migration checks, production
builds, dependency auditing, and repository secret scanning. A command is only considered
passing when its result is recorded in `docs/IMPLEMENTATION_STATUS.md`.

Live PostgreSQL migration validation requires a safe local/test endpoint. The CI workflow
uses an ephemeral PostgreSQL service; no non-local database may be destructively reset.
