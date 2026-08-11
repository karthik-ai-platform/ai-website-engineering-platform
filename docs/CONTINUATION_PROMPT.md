# Continuation Prompt

Continue the AI Website Engineering Platform in `C:\Users\HP\Desktop\ai-website-engineering-platform` on branch `codex/m03-provider-framework`.

Read `AGENTS.md`, the authoritative SRS PDF, `docs/IMPLEMENTATION_PLAN.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md`, and `docs/SESSION_HANDOFF.md`, then inspect Git state. Preserve concurrent work.

## Current checkpoint

M01 and M02 are complete. M02 completion record `b7203a6` is pushed; draft PR #2 remains open and GitHub CI run 31456298365 passed, including ephemeral PostgreSQL migration. Do not repeat completed work.

M03 is complete. Implementation commit `7a61fa0` and checkpoint commit `cd3e43f` are pushed; draft PR #3 is stacked on `codex/m02-projects-rbac` for a focused diff. GitHub CI run 31458789345, job 93677970681, passed full validation and ephemeral PostgreSQL migration. M03 adds versioned provider-neutral contracts and secret references; domain ports; deterministic mocks; authenticated/deduplicated/sequence-aware callback handling; typed provider outage behavior; dependency restrictions; an internal unexported raw-model adapter; and a public AI Cost Controller port whose initial mock denies every model request. ADR-012 records the boundary.

Local M03 evidence: formatting/lint passed; typecheck and build passed 8/8 packages; unit 11 files / 42 tests; contract 2 files / 13 tests; integration 5 files / 19 tests with 1 file / 1 live PostgreSQL test skipped; migration 2 files / 8 tests; browser/accessibility 3 tests; secret scan 121 files. Sandboxed npm audit could not reach the registry, but approved-network `npm run security:deps` exited 0 with the known 4 moderate `esbuild` advisories. `npm ls --omit=dev --all` exited 0 after materializing the provider workspace link. The corrected build no longer emits dependency artifacts into source.

The local `gh` token remains invalid, but SSH push and the connected GitHub app succeeded. Continue using authenticated in-scope paths; never expose credentials or merge autonomously.

## Next exact tasks

1. Commit and push the M03 completion record, then confirm its CI remains green.
2. Begin M04 GitHub onboarding in milestone order on a new `codex/m04-*` branch based on the green M03 commit.
3. Implement installation-first authorization, immutable commit identity, authenticated/replay-safe callbacks, least-privileged provider access, and deterministic mocks before real-provider validation.
4. Do not claim real provider evidence without observation and never invoke a model provider directly.

Never expose secrets, invoke an LLM outside the AI Cost Controller, weaken tenant scoping or append-only audit, production-deploy, modify production DNS/domains/secrets, force-push, push to `main`, merge a PR, or reset a non-local database.
