# Continuation Prompt

Continue the AI Website Engineering Platform in `C:\Users\HP\Desktop\ai-website-engineering-platform` on branch `codex/m04-github-onboarding`.

Read `AGENTS.md`, the authoritative SRS PDF, `docs/IMPLEMENTATION_PLAN.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md`, and `docs/SESSION_HANDOFF.md`, then inspect Git state. Preserve concurrent work.

## Current checkpoint

M01 and M02 are complete. M02 completion record `b7203a6` is pushed; draft PR #2 remains open and GitHub CI run 31456298365 passed, including ephemeral PostgreSQL migration. Do not repeat completed work.

M03 is complete. Completion record `917d1f3` is pushed; draft PR #3 is stacked on `codex/m02-projects-rbac`; final GitHub CI run 31459194718, job 93679135438, passed full validation and ephemeral PostgreSQL migration.

M04 is complete. Implementation commit `b15a2c3` and checkpoint commit `8da6394` are pushed; draft PR #4 is stacked on `codex/m03-provider-framework`. GitHub CI run 31462740132, job 93689360152, passed full validation and ephemeral PostgreSQL migration. M04 adds installation-first GitHub App onboarding with a distinct `repository:connect` permission; hashed/expiring/single-use state; opaque credential references; immutable repository/default-branch/permission synchronization; read-only readiness; typed API and PostgreSQL seams; raw HMAC webhook processing for installation/repository/push events; migration `0003_m04_github_onboarding`; and fixture/runbook evidence. ADR-013 records the decision. No real GitHub App was configured; evidence remains explicitly mock/contract.

Local M04 evidence: formatting/lint passed; typecheck and build passed 9/9 packages; unit 11 files / 44 tests; contract 3 files / 23 tests; integration 7 files / 23 tests with 1 file / 1 live PostgreSQL test skipped; migration 3 files / 11 tests; browser/accessibility 3 tests; secret scan 136 files. Sandboxed npm audit could not reach the registry, but approved-network `npm run security:deps` exited 0 with the known 4 moderate `esbuild` advisories. `npm ls --omit=dev --all` exited 0.

The local `gh` token remains invalid, but SSH push and the connected GitHub app succeeded. Continue using authenticated in-scope paths; never expose credentials or merge autonomously.

## Next exact tasks

1. Commit and push the M04 completion record, then confirm its CI remains green.
2. Begin M05 Repository intelligence on a new `codex/m05-*` branch based on the green M04 commit.
3. Build deterministic commit-addressed repository maps/retrieval manifests with exclusions, provenance, tenant isolation, and secret-safe fixture evidence.
4. Do not claim real GitHub evidence without completing `docs/runbooks/github-app-onboarding.md`; never invoke a model provider directly.

Never expose secrets, invoke an LLM outside the AI Cost Controller, weaken tenant scoping or append-only audit, production-deploy, modify production DNS/domains/secrets, force-push, push to `main`, merge a PR, or reset a non-local database.
