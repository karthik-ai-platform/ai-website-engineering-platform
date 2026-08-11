# Continuation Prompt

Continue the AI Website Engineering Platform in `C:\Users\HP\Desktop\ai-website-engineering-platform` on branch `codex/m02-projects-rbac`.

Read `AGENTS.md`, the authoritative SRS PDF, `docs/IMPLEMENTATION_PLAN.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md`, and `docs/SESSION_HANDOFF.md`, then inspect Git state. Preserve concurrent work.

## Current checkpoint

M01 and M02 are complete. M02 implementation commit `46b6d23` and checkpoint commit `6d5471b` are pushed; draft PR #2 is open and GitHub CI run 31455861287 passed, including ephemeral PostgreSQL migration. Do not repeat completed work.

M02 adds versioned project/RBAC contracts; conservative human role defaults; scoped service identities; tenant guards; authorization rechecks; audit evidence for allowed/denied actions; retention-aware create/archive/restore/delete; Fastify routes; a PostgreSQL adapter; migration `0002_m02_projects_rbac`; tests; ADR-011; and migration runbook updates.

Local evidence: formatting/lint passed; typecheck and build passed 7/7 packages; unit 11 files / 42 tests; contract 1 file / 8 tests; integration 5 files / 19 tests with 1 file / 1 live PostgreSQL test skipped; migration 2 files / 8 tests; browser/accessibility 3 tests; secret scan 110 files. Sandboxed npm audit could not reach the registry, but approved-network `npm run security:deps` exited 0 with the known 4 moderate `esbuild` advisories. `npm ls --omit=dev --all` exited 0. Local live PostgreSQL remains skipped because the required disposable endpoint variables are unset.

The local `gh` token remains invalid, but SSH push and the connected GitHub app succeeded. Continue using authenticated in-scope paths; never expose credentials or merge autonomously.

## Next exact tasks

1. Commit and push the M02 completion record, then confirm the resulting branch CI remains green.
2. Begin M03 Provider framework in milestone order: versioned provider-neutral ports/contracts, secret references, deterministic mocks/conformance suites, authenticated idempotent callback envelopes, and the single AI Cost Controller invocation boundary.
3. Do not claim real provider evidence without observation and never invoke a model provider directly.

Never expose secrets, invoke an LLM outside the AI Cost Controller, weaken tenant scoping or append-only audit, production-deploy, modify production DNS/domains/secrets, force-push, push to `main`, merge a PR, or reset a non-local database.
