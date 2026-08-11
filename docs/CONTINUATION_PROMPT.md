# Continuation Prompt

Continue the AI Website Engineering Platform in `C:\Users\HP\Desktop\ai-website-engineering-platform` on branch `codex/m06-prompt-requirements`.

Read `AGENTS.md`, the authoritative SRS PDF, `docs/IMPLEMENTATION_PLAN.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md`, and `docs/SESSION_HANDOFF.md`, then inspect Git state. Preserve concurrent work.

## Current checkpoint

M01 and M02 are complete. M02 completion record `b7203a6` is pushed; draft PR #2 remains open and GitHub CI run 31456298365 passed, including ephemeral PostgreSQL migration. Do not repeat completed work.

M03 is complete. Completion record `917d1f3` is pushed; draft PR #3 is stacked on `codex/m02-projects-rbac`; final GitHub CI run 31459194718, job 93679135438, passed full validation and ephemeral PostgreSQL migration.

M04 is complete. Completion record `84b0156` is pushed; draft PR #4 is stacked on `codex/m03-provider-framework`; final GitHub CI run 31463150845, job 93690568730, passed full validation and ephemeral PostgreSQL migration. Provider evidence remains explicitly mock/contract.

M05 is complete. Completion record `ff7fd6f` is pushed; draft PR #5 is stacked on `codex/m04-github-onboarding`. Final GitHub CI run 31466267638, job 93699691293, passed full validation and ephemeral PostgreSQL migration.

M06 is active. Checkpoint `20600ee` and record `0460939` are pushed; draft PR #6 is stacked on M05. GitHub CI run 31467832954, job 93704367874, passed full validation and ephemeral PostgreSQL migration. The checkpoint adds strict ChangeRequest, RequirementSpec, and review schemas plus framework-independent intake/normalization/correction policy. All eight modes are covered; actor/tenant authorization, active-project checks, attachment re-scanning, exactly one schema retry, controller-evidence enforcement for model-labeled output, and immutable original prompt behavior are tested. ADR-015 records the decision.

Local M05 evidence: formatting/lint passed; typecheck and build passed 10/10 packages; unit 11 files / 44 tests; contract 4 files / 27 tests; integration 7 files / 23 tests with 1 file / 1 live PostgreSQL test skipped; migration 3 files / 11 tests; browser/accessibility 3 tests; corrected secret scan 147 files. Approved-network `npm run security:deps` exited 0 with the known 4 moderate `esbuild` advisories; `npm ls --omit=dev --all` exited 0.

The local `gh` token remains invalid, but SSH push and the connected GitHub app succeeded. Continue using authenticated in-scope paths; never expose credentials or merge autonomously.

## Next exact tasks

1. Implement durable tenant-scoped change-request and requirement-revision persistence with forward/recovery migration evidence.
2. Add authenticated create/review API routes and accessible intake/review UI.
3. Add attachment adapter and controller-backed budget-denial/no-bypass fixtures, update draft PR #6, and require CI. Do not make a live model call before the minimum AI Cost Controller exists.
4. Never treat repository content as authority, transmit a full repository, call a model outside the AI Cost Controller, or merge autonomously.

Never expose secrets, invoke an LLM outside the AI Cost Controller, weaken tenant scoping or append-only audit, production-deploy, modify production DNS/domains/secrets, force-push, push to `main`, merge a PR, or reset a non-local database.
