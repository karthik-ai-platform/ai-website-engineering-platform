# GitHub App Onboarding Runbook

## Current evidence boundary

M04 is validated with deterministic GitHub App fixtures and contract tests. No real GitHub App,
installation, repository, credential, webhook endpoint, or provider call was configured during the
checkpoint. Do not describe fixture evidence as live-provider evidence.

The platform stores only opaque secret references. Never place a GitHub App private key, webhook
secret, installation token, OAuth code, or one-time state in source, Git history, logs, screenshots,
test fixtures, database JSON, or command arguments.

## Required owner setup for live validation

An authorized organization owner must perform and record these external actions before live GitHub
evidence can be credited:

1. Create an organization-owned GitHub App for the intended non-production validation environment.
2. Configure the App Setup URL to a management-web callback that preserves the authenticated user
   session and submits the installation selection to the typed control-plane completion endpoint.
3. Configure the webhook URL to the environment's raw-body GitHub webhook route when that route is
   composed with `GithubWebhookHandler`; do not expose an unverified generic callback endpoint.
4. Store the App private key and webhook secret in the approved secrets manager. Configure only
   their `SecretReferenceV1` provider/key/version values in platform settings.
5. Grant repository permissions `Metadata: Read-only` and `Contents: Read-only`. `Pull requests`
   may remain disabled for onboarding; later M11 write-path work requires a separate least-privilege
   review before enabling writes.
6. Subscribe only to the `Installation`, `Repositories`, and `Push` events required by M04.
7. Install the App on selected repositories rather than all repositories, unless a separately
   approved organization policy requires broader access.
8. Record the App slug/ID, installation ID, selected repository ID, observed permission map, default
   branch, immutable head commit, test environment, operator, timestamps, and approval reference.
   Do not record tokens, signatures, raw private keys, or unrestricted webhook payloads.

## Validation procedure

1. Initiate the connection as a currently authorized project Owner or a separately scoped service
   identity with `repository:connect`.
2. Confirm the persisted attempt contains a SHA-256 state digest, expiry, actor, tenant, project,
   and return URL, but not the raw state.
3. Complete the installation selection once. Confirm replay and expired-state attempts fail.
4. Confirm the repository ID, installation ID, default branch, permissions, and 40-character commit
   match GitHub. Readiness is `ready` only with Metadata and Contents read access.
5. Confirm API responses omit the App credential reference and contain no token/private-key value.
6. Deliver authenticated `installation`, `repository`, and `push` fixtures. Confirm invalid
   signatures are rejected, delivery IDs deduplicate, and only accepted events reach the
   application-owned refresh callback.
7. Remove repository access and confirm refresh changes readiness to `access_lost` while
   `mutationEnabled` remains false.

## Revocation and recovery

- Suspend onboarding and rotate the affected secret through the secrets manager if credential or
  webhook-secret exposure is suspected. Update the reference version; do not overwrite evidence.
- If installation access is removed, preserve the repository connection and mark it `access_lost`.
  Never fall back to a personal token or broader App installation.
- Retry a failed/expired setup through a new one-time attempt. Consumed attempts are not reset.
- Corrections append audit events; audit history and prior immutable commit references are retained.
