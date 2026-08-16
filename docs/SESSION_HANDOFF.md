# Session Handoff

**Checkpoint:** 2026-08-16 11:25:36 +05:30 (Asia/Calcutta)
**Repository:** `C:\Users\HP\Desktop\ai-website-engineering-platform`  
**Branch:** `codex/m08-isolated-runner`
**Implementation commits:** `2d385f1` (`feat(M08): orchestrate approved runner lifecycle [codex]`) and `cb28fe6` (`refactor(M08): keep runner persistence in worker [codex]`); pushed checkpoint `9fc8b11`
**Active milestone:** M08 Isolated runner - in progress
**Completed milestones:** M01, M02, M03, M04, M05, M06, M07

## Exact state

M01 and M02 are complete. M02 completion record `b7203a6` is pushed on `codex/m02-projects-rbac`; draft PR #2 remains open, and GitHub CI run 31456298365 passed the `validate` job including ephemeral PostgreSQL migration. Preserve M01/M02 evidence and do not repeat their implementation.

M03 is complete. Completion record `917d1f3` is pushed; draft PR #3 is stacked on `codex/m02-projects-rbac`; final GitHub CI run 31459194718, job 93679135438, passed full validation and ephemeral PostgreSQL migration.

M04 is complete. Completion record `84b0156` is pushed; draft PR #4 is stacked on `codex/m03-provider-framework`; final GitHub CI run 31463150845, job 93690568730, passed full validation and ephemeral PostgreSQL migration. Provider evidence remains fixture-only.

M05 is complete. Completion record `ff7fd6f` is pushed; draft PR #5 is stacked on `codex/m04-github-onboarding`. Final GitHub CI run 31466267638, job 93699691293, passed full validation and ephemeral PostgreSQL migration. ADR-014 records the deterministic repository intelligence decisions.

M06 is complete. Implementation `333d0d0` and checkpoint `c7f5bc0` are pushed; draft PR #6 is stacked on the completed M05 branch. GitHub CI run 31473572456, job 93722088032, passed full validation and ephemeral PostgreSQL migration. The accepted scope includes strict ChangeRequest/RequirementSpec/review contracts; all eight modes; immutable original prompt and revisioned corrections; durable tenant-scoped/idempotent PostgreSQL persistence with migration `0004`; authenticated create/review APIs; accessible `/changes/new` intake and review; deterministic attachment scanning; and an AI-controller-only Requirement role with denial-before-output evidence. ADR-015 records the decisions.

M07 is complete. Foundation `5a49f97`, governed API `94d34b7`, and analysis-gate implementation `0c18efd` are pushed; draft PR #7 is stacked on completed M06. Final GitHub CI run 31494692860, job 93789359220, passed full validation and ephemeral PostgreSQL migration. The accepted scope includes versioned plan/policy/approval contracts; deterministic golden-risk classification; immutable plan/policy/base-commit evidence; tenant-scoped persistence and idempotency; authenticated planning/approval APIs; ordered task graphs; current multi-gate/separation-of-duties enforcement; high-risk pre-mutation pause; blocked no-relaxation behavior; and typed completed Architecture/UI/Security analyses bound to requirement, base commit, and policy digest. ADR-016 records the decisions.

M07 completion record `7089a1e` is pushed. GitHub CI run 31495684020, job 93792676230, passed full validation and ephemeral PostgreSQL migration. `codex/m08-isolated-runner` was created from this exact completed checkpoint; no M08 implementation exists yet.

M08 is in progress. Foundation `f512045` is pushed and draft PR #8 is stacked on completed M07. GitHub CI run 31502183703, job 93814733180, passed full validation and ephemeral PostgreSQL migration. The foundation replaces the M03 raw runner command with versioned profile/workspace/argv/result/cancellation/cleanup contracts; deterministic tenant/run/base-commit/profile/allowlist/resource/filesystem/artifact policy; canonical profile digests; and an explicitly non-isolating conformance fixture that never invokes host processes and refuses production-isolation claims. ADR-017 records the boundary.

M08 orchestration/persistence implementation `2d385f1`, worker-boundary correction `cb28fe6`, and checkpoint `9fc8b11` are pushed. The service reauthorizes the current project-scoped service grant with service-only `run:execute`, recomputes current approvals, requires current policy/repository/base-commit evidence, schema-validates runner responses, and owns deterministic provision/execute/cancel/cleanup transitions. Migration `0007` and the worker-owned PostgreSQL adapter add tenant-scoped/idempotent workspace, command, artifact-reference, cancellation, cleanup, and append-only audit persistence without storing argv, environment, raw stdout/stderr, or secret values. ADR-018 records the decision. Pull-request CI run 31929973797/job 95123194324 and push CI run 31929972885/job 95123191756 passed full validation and ephemeral PostgreSQL migration at `9fc8b11`.

Implementation `94d34b7` and checkpoint `8ee4b4a` remain historical M07 service/API evidence. Do not repeat that slice.

## Validation evidence

- M05 validation passed formatting, lint, 10/10 typecheck, 11 files / 44 unit tests, 4 files / 27 contract tests, 7 files / 23 integration tests with 1 file / 1 live PostgreSQL test skipped, 3 files / 11 migration tests, 10/10 build, 3 browser/accessibility tests, and a corrected 147-file secret scan.
- The full command then failed only because sandboxed `npm audit` could not reach the registry. Approved-network `npm run security:deps` subsequently exited 0 and reported the known 4 moderate `esbuild` advisories through `drizzle-kit`.
- `npm ls --omit=dev --all` exited 0 with the previously documented optional dependency gaps/extraneous WASM helpers.
- The full M05 run passed through browser/accessibility, then the secret scanner rejected a token-shaped `.env.local` fixture. It was replaced with a redacted placeholder; contract tests and the 147-file scan passed. The content-based example-secret exclusion remains covered without introducing a credential.
- Local live PostgreSQL remains skipped because disposable variables are unset; M05 CI supplied the required ephemeral PostgreSQL migration evidence.
- `git diff --check` passed before checkpoint documentation and must be rerun after formatting these completion records.

## Known limitations and safety

- M02 completion evidence is satisfied by GitHub CI run 31456298365 and the recorded local validation.
- Host `gh auth status` succeeds for the active `karthik18mohan` account. Sandboxed processes cannot read the host keyring, so authenticated GitHub CLI operations require the approved host execution path; never expose the token.
- M03 final remote evidence is satisfied by CI run 31459194718 and the recorded local validation.
- M04 final remote repository/CI evidence is satisfied by run 31463150845; provider evidence remains deterministic mock/contract only.
- M05 final remote repository/CI evidence is satisfied by run 31466267638, job 93699691293.
- M06 final remote repository/CI evidence is satisfied by run 31473572456, job 93722088032.
- M06 validation passed formatting, lint, 10/10 typecheck, 12 files / 56 unit tests, 5 files / 32 contract tests, 9 files / 29 integration tests with 1 file / 1 live PostgreSQL test skipped, 4 files / 14 migration tests, 10/10 build, 4 browser/accessibility tests, a 158-file secret scan, dependency tree, approved-network high-threshold audit, and `git diff --check`.
- The first UI check found four unsafe FormData conversions and the first full validation found one mock-scanner literal-width type error; both were corrected. The clean full run passed through secret scanning and then only sandboxed audit transport failed; approved-network audit exited 0 with the unchanged four moderate esbuild advisories.
- M05 uses an in-memory conformance index and mock artifact store; a production durable artifact/index implementation remains an external provider decision and must preserve the scoped contracts.
- Production providers and the full M17 cost controller are not selected or implemented. No live model call is permitted before the minimum controller estimate/budget/routing/usage/reconciliation path exists.
- No model/provider call, production deployment, production domain/secret change, merge, or database reset is authorized.
- Do not run `npm audit fix --force`; it proposes a breaking `drizzle-kit` downgrade.
- M07 local full validation passed through the 164-file secret scan: 10/10 typecheck and build, 13 files / 68 unit tests, 6 files / 34 contract tests, 10 files / 32 integration tests with 1 file / 1 live PostgreSQL test skipped, 5 files / 17 migration tests, and 4 browser/accessibility tests. Approved-network high-threshold audit exited 0 with the unchanged four moderate advisories. Final multi-gate tightening passed domain typecheck and 13/13 focused tests.
- Final M07 analysis-gate validation passed formatting/lint, 10/10 typecheck and build, 13 files / 70 unit tests, 6 files / 36 contract tests, 11 files / 40 integration tests with 1 file / 1 live PostgreSQL test skipped, serialized 5 files / 17 migration tests, 4 browser/accessibility tests, and a 168-file secret scan. Approved-network audit exited 0 with the unchanged four moderate advisories. Final GitHub CI run 31494692860 passed full validation and ephemeral PostgreSQL migration.
- M08 foundation validation passed formatting/lint, 10/10 typecheck and build, 14 files / 74 unit tests, 7 files / 39 contract tests, 12 files / 45 integration tests with 1 file / 1 live PostgreSQL test skipped, serialized 5 files / 17 migration tests, 4 browser/accessibility tests, and a 173-file secret scan. Approved-network audit exited 0 with the unchanged four moderate advisories. GitHub CI run 31502183703 passed full validation and ephemeral PostgreSQL migration.
- M08 orchestration/persistence validation passed formatting/lint, 10/10 typecheck and build, 14 files / 75 unit tests, 7 files / 39 contract tests, 14 files / 51 integration tests with 1 file / 1 live PostgreSQL test skipped, serialized 6 files / 20 migration tests, 4 browser/accessibility tests, a 178-file secret scan, dependency tree, approved-network high-threshold audit, and `git diff --check`. One aggregate migration run had two known local PGlite setup-hook timeouts while 18 tests passed; the no-file-parallelism rerun passed 20/20.

## Next exact work

1. Select an approved production-isolation runtime and runner image/profile matrix; implement real immutable checkout, enforced CPU/memory/time/filesystem/process/network controls, cancellation/cleanup, and digest artifact capture behind the existing port.
2. Add forbidden host filesystem/process/network/credential/production-secret, resource-limit, malicious-install-script, cleanup, and artifact-integrity acceptance evidence. Never cite the conformance fixture as production isolation.
3. Integrate the production adapter through durable worker dispatch while preserving current approval reauthorization, immutable bindings, deny-by-default network/secrets/tool policy, and append-only evidence. Do not make a live model call or merge any PR autonomously.
