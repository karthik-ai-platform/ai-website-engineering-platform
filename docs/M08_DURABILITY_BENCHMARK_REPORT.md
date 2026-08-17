# M08 durability benchmark report

**Evaluation timestamp:** 2026-08-18 02:30 +05:30 (Asia/Calcutta)  
**Scope:** non-production evaluation only  
**Production selection:** not approved; this report does not select an engine

## Controlled infrastructure

- GitHub App `ai-website-nonprod`: App ID `4626913`, installation ID
  `154456584`, repository ID `1303930605`. Live read-only API evidence confirms
  the repository is private, the installation selects repositories rather than
  all organization repositories, Push is the sole subscribed event, and App
  permissions are Metadata read and Contents read with no Pull requests access.
- Artifact backend: Vercel Private Blob, Preview/non-production only. The adapter
  uses project OIDC/private access and application-owned authorization; clients
  receive `protected-artifact://` references rather than Blob URLs.
- Temporal Cloud: namespace `ai-website-platform-nonprod.k9p3k`, endpoint
  `ai-website-platform-nonprod.k9p3k.tmprl.cloud:7233`, region `asia-south1`,
  retention 7 days, `TEMPORAL_API_KEY` secret reference, USD 50/month evaluation
  target. No production SLA dependency is approved.
- Workflow: stable `4.8.3` and SDK 5 beta `5.0.0-beta.42` are isolated on separate
  benchmark branches. SDK 5 remains beta/non-production and neither branch is
  merged into the application branch.

## Result summary

| Area                           | Temporal Cloud / SDK 1.22.0                                                                                             | Workflow 4.8.3                                                                                         | Workflow 5.0.0-beta.42                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Outcome                        | **Blocked** for live Cloud; suitable for further local evaluation                                                       | **Suitable for further evaluation**                                                                    | **Suitable for further evaluation**, beta/non-production                   |
| Environment                    | Official time-skipping Temporal test server; Cloud endpoint reached but rejected the pulled placeholder credential      | Local Workflow Vitest runtime and guarded Vercel Preview                                               | Local Workflow Vitest runtime and guarded Vercel Preview                   |
| Basic / parallel / payload     | Pass, including 262,144-byte deterministic payload                                                                      | Pass locally; 1,024-byte basic Preview run completed                                                   | Pass locally; 1,024-byte basic Preview run completed                       |
| Transient retry / recovery     | Pass; recovery occurred on attempt 2                                                                                    | Pass; recovery occurred on attempt 2                                                                   | Pass; recovery occurred on attempt 2                                       |
| Durable pause / resume         | Sleep and approval signal pass locally                                                                                  | Sleep and approval hook pass locally                                                                   | Sleep and approval hook pass locally                                       |
| Permanent failure              | Pass; non-retryable failure observed                                                                                    | Pass; fatal failure observed                                                                           | Pass; fatal failure observed                                               |
| Cancellation                   | Pass locally                                                                                                            | Pass locally                                                                                           | Pass locally                                                               |
| Replay / interruption evidence | Temporal deterministic replay semantics exercised by the test worker; live Cloud worker interruption remains unobserved | Local runtime tests pass; managed runtime interruption remains unobserved                              | Local runtime tests pass; managed runtime interruption remains unobserved  |
| Preview evidence               | Not available because live credentials are blocked                                                                      | READY Preview `f5vqrvhb6`; run `wrun_01M08Q5AB98E6WVHTWFQGNP7P7` completed                             | READY Preview `exhmk5ete`; run `wrun_41M08QDP2X0GR7BW7ARMC71DA3` completed |
| Latency                        | Local test-suite timing is not a Cloud latency measurement                                                              | End-to-end Preview latency distribution not captured; inconclusive                                     | End-to-end Preview latency distribution not captured; inconclusive         |
| Retries                        | Deterministic attempt count recorded                                                                                    | Deterministic attempt count recorded                                                                   | Deterministic attempt count recorded                                       |
| Auditability / observability   | Workflow IDs, run IDs, activity attempts and typed failures are available; Cloud UI evidence blocked                    | Run IDs, statuses, step attempts and results available                                                 | Same, subject to beta behavior changes                                     |
| Developer complexity           | Separate worker, activities, workflow, client/CLI and Cloud operations                                                  | Next.js routes plus workflow/step functions                                                            | Same integration shape as stable in this benchmark                         |
| Operational complexity         | Highest of the three: separately operated worker and Cloud namespace                                                    | Managed Vercel runtime; guarded routes and hooks                                                       | Managed runtime plus beta upgrade/change risk                              |
| Failure semantics              | Explicit retryable/non-retryable application failures and cancellation                                                  | `RetryableError`, `FatalError`, hooks and run cancellation                                             | Same tested surface in beta.42                                             |
| Idempotency                    | Deterministic workflow IDs; duplicate-start policy is explicit in the CLI                                               | Vercel run IDs and deterministic benchmark run keys; duplicate privileged effects were not live-tested | Same limitation                                                            |
| Cost                           | No defensible live usage amount; USD 50/month cap remains the evaluation target                                         | No defensible per-run cost captured                                                                    | No defensible per-run cost captured                                        |

## Protected artifact evidence

The new `@platform/vercel-blob-artifacts` package enforces the path
`tenants/{tenantId}/projects/{projectId}/runs/{runId}/artifacts/{artifactId}`,
private access, tenant/project authorization, SHA-256 verification, a 16 MiB
limit, an explicit MIME allowlist, deletion state and bounded garbage collection.
Retention is ephemeral 24 hours, benchmark 7 days, standard 30 days, or pinned
without automatic deletion. PostgreSQL migration `0009_m08_protected_artifacts`
keeps identity/integrity metadata immutable after creation and permits only the
first deletion mark. Tests pass for cross-tenant and cross-project denial,
digest mismatch, size/MIME rejection, expired-object collection, pinned-object
preservation and normal put/read/delete.

## Sandbox/VCR evidence

- Private repository: `sandbox-benchmark` in the linked non-production project.
- Image: `sandbox-benchmark@sha256:cfc9b64d4b5ccc2d7a88981157d19a7428825055bc37ff312a8dd40aa0fca67f`.
- Architecture and size: linux/amd64, 110.5 MB.
- Build/push time: 88.692 seconds after the dependency-aware Containerfile fix.
- Live startup: 1,041 ms; deterministic command: 717 ms; teardown: 2,384 ms.
- Security behavior: UID 10001, deny-all network policy, no credentials or env
  files in the image context, expected success exit 0 and forced failure exit 1.

## Validation evidence

- Main repository: formatting and lint passed; typecheck/build passed for 12/12
  packages; unit 15 files / 82 tests; contract 11 files / 58 tests; integration
  22 files / 85 tests with one live PostgreSQL file/test skipped; migration
  compatibility 6 files / 20 tests; browser/accessibility 4 tests; secret scan
  232 text files; dependency gate passed with four known moderate development
  `esbuild` advisories and no high/critical exit failure.
- Workflow stable and beta, separately: formatting/lint/typecheck/build passed;
  each Workflow integration suite passed 1 file / 4 tests. Remote Preview builds
  completed and the guarded basic scenario completed on each version.
- GitHub webhook route verifies the exact raw body/signature boundary and the
  adapter handles Push, Installation and Installation repositories events with
  replay-safe delivery handling.

## Limitations and manual actions

1. Replace the current Vercel Preview `TEMPORAL_API_KEY` placeholder with a real
   non-production Temporal Cloud API key. The value pulled locally was an
   encrypted placeholder and Cloud rejected it as a malformed JWT; no value was
   printed or committed. Then run the live worker/CLI interruption matrix.
2. Run the full live latency, cancellation, duplicate start, worker interruption,
   managed-runtime interruption and cost sample against both finalists. Current
   Preview evidence proves deployment and a basic run, not statistical latency
   or a production durability decision.
3. Exercise the live Private Blob adapter through the fully composed worker after
   a disposable benchmark run exists in PostgreSQL. Local authorization,
   integrity, retention and migration evidence is complete; production runner
   dispatch remains fail-closed until its concrete providers are injected.
4. Workflow stable reports 21 dependency advisories (6 moderate, 15 high) and
   beta reports 18 (4 moderate, 14 high) in their isolated dependency trees.
   These require upstream/workspace-specific review; no forced audit fix was run.

No candidate is declared a production winner. A follow-up ADR may use “suitable
for further evaluation”, “not suitable”, “blocked”, or “inconclusive” only after
the remaining common live workload and organization approval gates are observed.
