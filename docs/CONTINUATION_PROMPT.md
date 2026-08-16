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

M08 orchestration/persistence implementation `2d385f1`, worker-boundary correction `cb28fe6`, and checkpoint `9fc8b11` are pushed. The service reauthorizes current project-scoped `run:execute` authority, recomputes current approvals, requires current policy/repository/base-commit evidence, validates runner responses, and owns provision/execute/cancel/cleanup transitions. Migration `0007` and the worker-owned PostgreSQL adapter persist tenant-scoped/idempotent workspace, command, artifact-reference, cancellation, cleanup, and append-only audit evidence without argv, environment, raw stdout/stderr, or secret values. ADR-018 records the decision. Pull-request CI run 31929973797/job 95123194324 and push CI run 31929972885/job 95123191756 passed full validation and ephemeral PostgreSQL migration at `9fc8b11`.

Documentation checkpoint `b3e49e9` is pushed; pull-request CI run 31930359565 and push CI run 31930357204 passed full validation and ephemeral PostgreSQL migration.

M08 production-adapter foundation `757820c` is pushed. ADR-019 selects Vercel Sandbox behind `@platform/vercel-sandbox-runner` with `@vercel/sandbox` pinned to GA 3.0.0. The package validates a strict versioned approved-image manifest, requires an exact SHA-256 image/profile binding and hardening attestations, plans non-persistent zero-port/empty-environment sessions with supported vCPU/fixed-memory coupling and deny-all or HTTPS-only domain allowlists, and verifies provider-reported image/resources/timeout/persistence/status/expiry/network policy after creation. A mismatch is stopped and rejected. Pull-request CI run 31933994202/job 95133007721 and push CI run 31933992460/job 95133002939 passed full validation and ephemeral PostgreSQL migration. No live sandbox was created, and no provider isolation acceptance is claimed.

Adapter validation: formatting/lint passed; typecheck and build passed 11/11 packages; unit 14 files / 75 tests; contract 8 files / 44 tests; integration 15 files / 53 tests with 1 file / 1 live PostgreSQL test skipped; serialized migration validation 6 files / 20 tests; browser/accessibility 4 tests; secret scan 187 files; dependency tree exit 0; approved-network high-threshold audit exit 0 with the unchanged four moderate `esbuild` advisories. Focused adapter evidence is 5/5 planner contract and 2/2 verified-session integration tests. The aggregate and incorrectly forwarded migration reruns reproduced five known local PGlite setup-hook timeouts while 15 tests passed; the correctly serialized workspace command passed 20/20.

Local M08 orchestration evidence: formatting/lint passed; typecheck and build passed 10/10 packages; unit 14 files / 75 tests; contract 7 files / 39 tests; integration 14 files / 51 tests with 1 file / 1 live PostgreSQL test skipped; serialized migration validation 6 files / 20 tests; browser/accessibility 4 tests; secret scan 178 files; dependency tree exit 0. Approved-network `npm run security:deps` exited 0 with the unchanged four moderate `esbuild` advisories. One aggregate migration run had two known 10-second PGlite setup-hook timeouts while 18 tests passed; the no-file-parallelism rerun passed 20/20.

Implementation `94d34b7` and checkpoint `8ee4b4a` remain historical M07 service/API evidence. Do not repeat them.

Final M07 local evidence: formatting/lint passed; typecheck and build passed 10/10 packages; unit 13 files / 70 tests; contract 6 files / 36 tests; integration 11 files / 40 tests with 1 file / 1 live PostgreSQL test skipped; serialized migration validation 5 files / 17 tests; browser/accessibility 4 tests; secret scan 168 files. Approved-network `npm run security:deps` exited 0 with the unchanged four moderate `esbuild` advisories. Missing/mismatched/stale analysis fixtures stop before persistence, and incomplete controller evidence stops without retry. The parallel PGlite setup timeouts were infrastructure-only; the serialized rerun and GitHub ephemeral PostgreSQL step passed.

Local M06 evidence: formatting/lint passed; 10/10 typecheck and build; unit 12 files / 56 tests; contract 5 files / 32 tests; integration 9 files / 29 tests with 1 file / 1 live PostgreSQL test skipped; migration 4 files / 14 tests; browser/accessibility 4 tests; secret scan 158 files; dependency tree exit 0. Approved-network `npm run security:deps` exited 0 with the unchanged four moderate `esbuild` advisories. The sandboxed audit transport failure is infrastructure-only.

Local M05 evidence: formatting/lint passed; typecheck and build passed 10/10 packages; unit 11 files / 44 tests; contract 4 files / 27 tests; integration 7 files / 23 tests with 1 file / 1 live PostgreSQL test skipped; migration 3 files / 11 tests; browser/accessibility 3 tests; corrected secret scan 147 files. Approved-network `npm run security:deps` exited 0 with the known 4 moderate `esbuild` advisories; `npm ls --omit=dev --all` exited 0.

Host GitHub CLI authentication is valid for `karthik18mohan`; sandboxed processes cannot read the host keyring, so authenticated GitHub CLI operations require the approved host execution path. Never expose credentials or merge autonomously.

## Next exact tasks

1. Build and publish the approved digest-pinned hardened Vercel Sandbox runner image; implement immutable checkout and short-lived credential brokering without production-secret injection.
2. Implement the fixed in-image command broker, enforced process/filesystem/disk/install-script controls, cancellation/cleanup, and digest artifact capture behind the existing adapter.
3. Integrate the adapter through durable worker dispatch and obtain live forbidden host filesystem/process/network/credential/production-secret, resource-limit, malicious-install-script, cleanup, and artifact-integrity evidence. Never cite the conformance fixture or mocked session verification as production isolation. Do not make a live model call, deploy production, or merge autonomously.

Never expose secrets, invoke an LLM outside the AI Cost Controller, weaken tenant scoping or append-only audit, production-deploy, modify production DNS/domains/secrets, force-push, push to `main`, merge a PR, or reset a non-local database.
