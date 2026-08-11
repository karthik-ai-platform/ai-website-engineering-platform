-- Migration: 0003_m04_github_onboarding
-- Purpose: Add tenant-scoped GitHub connection attempts, immutable repository
-- metadata, and the distinct repository connection service permission.
--
-- Forward procedure:
--   1. Verify target, backup/PITR point, and that 0001-0002 are applied.
--   2. Apply with the package migration runner.
--   3. Verify tenant foreign keys, mutation-disabled checks, and state digests.
--
-- Recovery guidance:
--   Roll back the application while retaining this additive schema. Correct
--   defects with a reviewed forward migration. In a disposable local/test
--   database only, drop repository_connections and github_connection_attempts,
--   then restore the prior permission constraint. Production restoration
--   requires the approved backup/PITR procedure; audit history is retained.

ALTER TABLE service_identity_permissions
  DROP CONSTRAINT service_identity_permissions_permission_check;
--> statement-breakpoint

ALTER TABLE service_identity_permissions
  ADD CONSTRAINT service_identity_permissions_permission_check CHECK (
    permission IN (
      'project:read', 'project:create', 'project:archive', 'project:restore', 'project:delete',
      'change:request', 'change:approve', 'repository:connect', 'git:merge',
      'release:promote', 'secret:manage', 'policy:modify', 'member:manage'
    )
  );
--> statement-breakpoint

CREATE TABLE github_connection_attempts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  state_digest text NOT NULL CHECK (length(state_digest) = 64),
  return_url text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT github_connection_attempts_project_tenant_fk
    FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint

CREATE INDEX github_connection_attempts_project_id_idx
  ON github_connection_attempts (project_id, expires_at);
--> statement-breakpoint

CREATE TABLE repository_connections (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = 'github'),
  installation_id text NOT NULL,
  repository_id text NOT NULL,
  owner text NOT NULL,
  name text NOT NULL,
  permissions jsonb NOT NULL,
  default_branch text NOT NULL,
  indexed_commit text NOT NULL CHECK (length(indexed_commit) = 40),
  app_credential_ref jsonb NOT NULL CHECK (
    jsonb_typeof(app_credential_ref) = 'object'
    AND app_credential_ref ? 'provider'
    AND app_credential_ref ? 'key'
    AND NOT (app_credential_ref ?| array['value', 'token', 'secret', 'privateKey'])
  ),
  readiness text NOT NULL CHECK (
    readiness IN ('ready', 'insufficient_permissions', 'access_lost')
  ),
  mutation_enabled boolean NOT NULL DEFAULT false CHECK (mutation_enabled = false),
  metadata jsonb NOT NULL,
  connected_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL,
  CONSTRAINT repository_connections_organization_project_unique
    UNIQUE (organization_id, project_id),
  CONSTRAINT repository_connections_project_tenant_fk
    FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
