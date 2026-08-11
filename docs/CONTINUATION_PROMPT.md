# Continuation Prompt

Continue the AI Website Engineering Platform in `C:\Users\HP\Desktop\ai-website-engineering-platform` on branch `codex/m08-isolated-runner`.

Read `AGENTS.md`, the authoritative SRS PDF, `docs/IMPLEMENTATION_PLAN.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md`, and `docs/SESSION_HANDOFF.md`, then inspect Git state. Preserve concurrent work.

## Current checkpoint

M01 and M02 are complete. M02 completion record `b7203a6` is pushed; draft PR #2 remains open and GitHub CI run 31456298365 passed, including ephemeral PostgreSQL migration. Do not repeat completed work.

M03 is complete. Completion record `917d1f3` is pushed; draft PR #3 is stacked on `codex/m02-projects-rbac`; final GitHub CI run 31459194718, job 93679135438, passed full validation and ephemeral PostgreSQL migration.

M04 is complete. Completion record `84b0156` is pushed; draft PR #4 is stacked on `codex/m03-provider-framework`; final GitHub CI run 31463150845, job 93690568730, passed full validation and ephemeral PostgreSQL migration. Provider evidence remains explicitly mock/contract.

M05 is complete. Completion record `ff7fd6f` is pushed; draft PR #5 is stacked on `codex/m04-github-onboarding`. Final GitHub CI run 31466267638, job 93699691293, passed full validation and ephemeral PostgreSQL migration.

M06 is complete. Implementation `333d0d0` and checkpoint `c7f5bc0` are pushed; draft PR #6 is stacked on the completed M05 branch. GitHub CI run 31473572456, job 93722088032, passed full validation and ephemeral PostgreSQL migration. The accepted scope includes strict ChangeRequest/RequirementSpec/review contracts; all eight modes; immutable original prompt and revisioned corrections; durable tenant-scoped/idempotent PostgreSQL persistence with migration `0004`; authenticated create/review APIs; accessible `/changes/new` intake and review; deterministic attachment scanning; and an AI-controller-only Requirement role with denial-before-output evidence. ADR-015 records the decision.

M07 is complete. Foundation `5a49f97`, governed API `94d34b7`, and analysis-gate implementation `0c18efd` are pushed; draft PR #7 is stacked on completed M06. Final GitHub CI run 31494692860, job 93789359220, passed full validation and ephemeral PostgreSQL migration. The completed milestone includes versioned execution plan/policy/approval and specialized-analysis contracts; deterministic Low/Medium/High/Blocked classification; tenant-scoped persistence/idempotency/audit; authenticated planning and approval APIs; high-risk pre-mutation pause; current multi-gate approvals; blocked no-relaxation behavior; and typed completed Architecture/UI/Security evidence bound to requirement, base commit, and policy digest. ADR-016 records the decisions.

M07 completion record `7089a1e` is pushed. GitHub CI run 31495684020, job 93792676230, passed full validation and ephemeral PostgreSQL migration. Branch `codex/m08-isolated-runner` starts from that exact checkpoint; M08 implementation has not started.

M08 is in progress. Foundation `f512045` is pushed and draft PR #8 is stacked on completed M07. GitHub CI run 31502183703, job 93814733180, passed full validation and ephemeral PostgreSQL migration. This slice replaces the raw M03 runner seam with versioned isolation-profile, immutable workspace, shell-free executable-plus-argv command, result/evidence, cancellation, and cleanup contracts; deterministic tenant/run/base-commit/profile/allowlist/resource/filesystem/artifact policy; canonical profile hashing; and an explicitly non-isolating conformance fixture that refuses production-isolation claims. ADR-017 records the decision.

M08 orchestration/persistence implementation `2d385f1` and worker-boundary correction `cb28fe6` are committed locally. The service reauthorizes current project-scoped `run:execute` authority, recomputes current approvals, requires current policy/repository/base-commit evidence, validates runner responses, and owns provision/execute/cancel/cleanup transitions. Migration `0007` and the worker-owned PostgreSQL adapter persist tenant-scoped/idempotent workspace, command, artifact-reference, cancellation, cleanup, and append-only audit evidence without argv, environment, raw stdout/stderr, or secret values. ADR-018 records the decision. Push and remote CI are pending.

Local M08 orchestration evidence: formatting/lint passed; typecheck and build passed 10/10 packages; unit 14 files / 75 tests; contract 7 files / 39 tests; integration 14 files / 51 tests with 1 file / 1 live PostgreSQL test skipped; serialized migration validation 6 files / 20 tests; browser/accessibility 4 tests; secret scan 178 files; dependency tree exit 0. Approved-network `npm run security:deps` exited 0 with the unchanged four moderate `esbuild` advisories. One aggregate migration run had two known 10-second PGlite setup-hook timeouts while 18 tests passed; the no-file-parallelism rerun passed 20/20.

Implementation `94d34b7` and checkpoint `8ee4b4a` remain historical M07 service/API evidence. Do not repeat them.

Final M07 local evidence: formatting/lint passed; typecheck and build passed 10/10 packages; unit 13 files / 70 tests; contract 6 files / 36 tests; integration 11 files / 40 tests with 1 file / 1 live PostgreSQL test skipped; serialized migration validation 5 files / 17 tests; browser/accessibility 4 tests; secret scan 168 files. Approved-network `npm run security:deps` exited 0 with the unchanged four moderate `esbuild` advisories. Missing/mismatched/stale analysis fixtures stop before persistence, and incomplete controller evidence stops without retry. The parallel PGlite setup timeouts were infrastructure-only; the serialized rerun and GitHub ephemeral PostgreSQL step passed.

Local M06 evidence: formatting/lint passed; 10/10 typecheck and build; unit 12 files / 56 tests; contract 5 files / 32 tests; integration 9 files / 29 tests with 1 file / 1 live PostgreSQL test skipped; migration 4 files / 14 tests; browser/accessibility 4 tests; secret scan 158 files; dependency tree exit 0. Approved-network `npm run security:deps` exited 0 with the unchanged four moderate `esbuild` advisories. The sandboxed audit transport failure is infrastructure-only.

Local M05 evidence: formatting/lint passed; typecheck and build passed 10/10 packages; unit 11 files / 44 tests; contract 4 files / 27 tests; integration 7 files / 23 tests with 1 file / 1 live PostgreSQL test skipped; migration 3 files / 11 tests; browser/accessibility 3 tests; corrected secret scan 147 files. Approved-network `npm run security:deps` exited 0 with the known 4 moderate `esbuild` advisories; `npm ls --omit=dev --all` exited 0.

The local `gh` token remains invalid, but SSH push and the connected GitHub app succeeded. Continue using authenticated in-scope paths; never expose credentials or merge autonomously.

## Next exact tasks

1. Push `2d385f1` and `cb28fe6`, update draft PR #8, and require green CI including the ephemeral PostgreSQL migration before relying on remote evidence.
2. Select an approved production-isolation runtime and image/profile matrix; implement real immutable checkout, enforced CPU/memory/time/filesystem/process/network controls, cancellation/cleanup, and digest artifact capture behind the existing port.
3. Add forbidden host filesystem/process/network/credential/production-secret, resource-limit, malicious-install-script, cleanup, and artifact-integrity acceptance evidence. Never cite the conformance fixture as production isolation.
4. Integrate the production adapter through durable worker dispatch while preserving current approval reauthorization, immutable bindings, deny-by-default network/secrets/tool policy, and append-only evidence. Do not make a live model call, deploy production, or merge autonomously.

Never expose secrets, invoke an LLM outside the AI Cost Controller, weaken tenant scoping or append-only audit, production-deploy, modify production DNS/domains/secrets, force-push, push to `main`, merge a PR, or reset a non-local database.
