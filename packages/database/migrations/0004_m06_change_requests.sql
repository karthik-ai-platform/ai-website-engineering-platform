-- Migration: 0004_m06_change_requests
-- Purpose: Persist tenant-scoped immutable change intake and append-only
-- requirement revisions for M06.
--
-- Forward procedure:
--   1. Verify target, backup/PITR point, and that 0001-0003 are applied.
--   2. Apply with the package migration runner.
--   3. Verify composite tenant foreign keys, immutable intake trigger,
--      append-only requirement trigger, and revision uniqueness.
--
-- Recovery guidance:
--   Roll back the application while retaining this additive schema. Correct
--   defects with a reviewed forward migration. In a disposable local/test
--   database only, drop requirement_specs, then change_requests and their
--   trigger functions. Production restoration requires the approved
--   backup/PITR procedure; audit and accepted requirement history is retained.

CREATE TABLE change_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'service')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 256),
  original_prompt text NOT NULL CHECK (length(original_prompt) BETWEEN 1 AND 20000),
  mode text NOT NULL CHECK (
    mode IN ('builder', 'designer', 'refactor', 'debug', 'seo', 'performance', 'accessibility', 'content')
  ),
  target text NOT NULL CHECK (target IN ('preview', 'staging', 'production')),
  constraints jsonb NOT NULL,
  attachments jsonb NOT NULL,
  status text NOT NULL CHECK (
    status IN ('intake_complete', 'requirements_pending', 'requirements_review', 'blocked')
  ),
  created_at timestamptz NOT NULL,
  CONSTRAINT change_requests_organization_project_id_unique
    UNIQUE (organization_id, project_id, id),
  CONSTRAINT change_requests_organization_project_idempotency_unique
    UNIQUE (organization_id, project_id, idempotency_key),
  CONSTRAINT change_requests_project_tenant_fk
    FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT change_requests_json_shape_check CHECK (
    jsonb_typeof(constraints) = 'array' AND jsonb_typeof(attachments) = 'array'
  )
);
--> statement-breakpoint

CREATE INDEX change_requests_project_created_at_idx
  ON change_requests (project_id, created_at);
--> statement-breakpoint

CREATE TABLE requirement_specs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  change_request_id uuid NOT NULL,
  schema_version text NOT NULL CHECK (schema_version = '1'),
  revision integer NOT NULL CHECK (revision > 0),
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  assumptions jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'array'),
  created_at timestamptz NOT NULL,
  CONSTRAINT requirement_specs_change_request_revision_unique
    UNIQUE (change_request_id, revision),
  CONSTRAINT requirement_specs_change_request_tenant_fk
    FOREIGN KEY (organization_id, project_id, change_request_id)
    REFERENCES change_requests (organization_id, project_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint

CREATE INDEX requirement_specs_change_request_revision_idx
  ON requirement_specs (change_request_id, revision);
--> statement-breakpoint

CREATE FUNCTION reject_change_request_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
    OR NEW.actor_type IS DISTINCT FROM OLD.actor_type
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.original_prompt IS DISTINCT FROM OLD.original_prompt
    OR NEW.mode IS DISTINCT FROM OLD.mode
    OR NEW.target IS DISTINCT FROM OLD.target
    OR NEW.constraints IS DISTINCT FROM OLD.constraints
    OR NEW.attachments IS DISTINCT FROM OLD.attachments
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'change request intake is immutable; create a requirement revision instead'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER change_requests_reject_immutable_update
BEFORE UPDATE ON change_requests
FOR EACH ROW
EXECUTE FUNCTION reject_change_request_immutable_mutation();
--> statement-breakpoint

CREATE FUNCTION reject_requirement_spec_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'requirement_specs is append-only; append a revision instead'
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER requirement_specs_reject_update_or_delete
BEFORE UPDATE OR DELETE ON requirement_specs
FOR EACH ROW
EXECUTE FUNCTION reject_requirement_spec_mutation();
--> statement-breakpoint

CREATE TRIGGER requirement_specs_reject_truncate
BEFORE TRUNCATE ON requirement_specs
FOR EACH STATEMENT
EXECUTE FUNCTION reject_requirement_spec_mutation();
