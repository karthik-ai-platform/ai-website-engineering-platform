-- Migration: 0005_m07_plans_approvals
-- Purpose: Persist tenant-scoped immutable execution plans, deterministic run
-- state, policy snapshots, and approval decisions for M07.
--
-- Forward procedure:
--   1. Verify target, backup/PITR point, and that 0001-0004 are applied.
--   2. Apply with the package migration runner.
--   3. Verify tenant foreign keys, append-only plan enforcement, run-state
--      transition enforcement, and single-decision approval enforcement.
--
-- Recovery guidance:
--   Roll back the application while retaining this additive schema. Correct
--   defects with a reviewed forward migration. In a disposable local/test
--   database only, drop approvals, runs, execution_plans, and their trigger
--   functions. Production restoration requires the approved backup/PITR
--   procedure; accepted plans, approvals, and audit history are retained.

ALTER TABLE requirement_specs
  ADD CONSTRAINT requirement_specs_organization_project_change_id_unique
  UNIQUE (organization_id, project_id, change_request_id, id);
--> statement-breakpoint

CREATE TABLE execution_plans (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  change_request_id uuid NOT NULL,
  requirement_id uuid NOT NULL,
  schema_version text NOT NULL CHECK (schema_version = '1'),
  revision integer NOT NULL CHECK (revision > 0),
  base_commit text NOT NULL CHECK (base_commit ~ '^[0-9a-f]{40}$'),
  risk_class text NOT NULL CHECK (risk_class IN ('low', 'medium', 'high', 'blocked')),
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  policy_snapshot jsonb NOT NULL CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  created_at timestamptz NOT NULL,
  CONSTRAINT execution_plans_organization_project_change_id_unique
    UNIQUE (organization_id, project_id, change_request_id, id),
  CONSTRAINT execution_plans_organization_project_id_unique
    UNIQUE (organization_id, project_id, id),
  CONSTRAINT execution_plans_change_revision_unique
    UNIQUE (change_request_id, revision),
  CONSTRAINT execution_plans_requirement_tenant_fk
    FOREIGN KEY (organization_id, project_id, change_request_id, requirement_id)
    REFERENCES requirement_specs (organization_id, project_id, change_request_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint

CREATE INDEX execution_plans_change_revision_idx
  ON execution_plans (change_request_id, revision);
--> statement-breakpoint

CREATE TABLE runs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  change_request_id uuid NOT NULL,
  execution_plan_id uuid NOT NULL,
  base_commit text NOT NULL CHECK (base_commit ~ '^[0-9a-f]{40}$'),
  state text NOT NULL CHECK (state IN (
    'DRAFT', 'PLANNING', 'AWAITING_APPROVAL', 'QUEUED', 'PREPARING', 'IMPLEMENTING',
    'VALIDATING', 'COMMITTING', 'DEPLOYING_PREVIEW', 'VERIFYING_PREVIEW',
    'READY_FOR_REVIEW', 'PROMOTING', 'COMPLETED', 'REJECTED', 'CANCELLED',
    'FAILED', 'ROLLED_BACK'
  )),
  policy_snapshot jsonb NOT NULL CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  created_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  CONSTRAINT runs_organization_project_id_unique UNIQUE (organization_id, project_id, id),
  CONSTRAINT runs_change_request_tenant_fk
    FOREIGN KEY (organization_id, project_id, change_request_id)
    REFERENCES change_requests (organization_id, project_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT runs_execution_plan_tenant_fk
    FOREIGN KEY (organization_id, project_id, change_request_id, execution_plan_id)
    REFERENCES execution_plans (organization_id, project_id, change_request_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint

CREATE INDEX runs_project_created_at_idx ON runs (project_id, created_at);
--> statement-breakpoint

CREATE TABLE approvals (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  run_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  plan_revision integer NOT NULL CHECK (plan_revision > 0),
  gate text NOT NULL CHECK (gate IN ('plan_execution', 'destructive_action', 'production_promotion')),
  decision text NOT NULL CHECK (decision IN ('pending', 'approved', 'rejected')),
  requester_id uuid NOT NULL,
  approver_id uuid,
  rationale text,
  policy_version text NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 256),
  requested_at timestamptz NOT NULL,
  decided_at timestamptz,
  CONSTRAINT approvals_run_gate_unique UNIQUE (run_id, gate),
  CONSTRAINT approvals_tenant_idempotency_unique UNIQUE (organization_id, project_id, idempotency_key),
  CONSTRAINT approvals_run_tenant_fk
    FOREIGN KEY (organization_id, project_id, run_id)
    REFERENCES runs (organization_id, project_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT approvals_plan_tenant_fk
    FOREIGN KEY (organization_id, project_id, plan_id)
    REFERENCES execution_plans (organization_id, project_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT approvals_decision_shape_check CHECK (
    (decision = 'pending' AND approver_id IS NULL AND rationale IS NULL AND decided_at IS NULL)
    OR
    (decision IN ('approved', 'rejected') AND approver_id IS NOT NULL AND rationale IS NOT NULL AND decided_at IS NOT NULL)
  )
);
--> statement-breakpoint

CREATE FUNCTION reject_execution_plan_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'execution_plans is append-only; append a revision instead' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER execution_plans_reject_update_or_delete
BEFORE UPDATE OR DELETE ON execution_plans
FOR EACH ROW EXECUTE FUNCTION reject_execution_plan_mutation();
--> statement-breakpoint

CREATE FUNCTION enforce_run_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.change_request_id IS DISTINCT FROM OLD.change_request_id
    OR NEW.execution_plan_id IS DISTINCT FROM OLD.execution_plan_id
    OR NEW.base_commit IS DISTINCT FROM OLD.base_commit
    OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'run identity and policy snapshot are immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
    (OLD.state = 'DRAFT' AND NEW.state IN ('PLANNING', 'CANCELLED')) OR
    (OLD.state = 'PLANNING' AND NEW.state IN ('AWAITING_APPROVAL', 'QUEUED', 'FAILED', 'CANCELLED')) OR
    (OLD.state = 'AWAITING_APPROVAL' AND NEW.state IN ('QUEUED', 'REJECTED', 'CANCELLED')) OR
    (OLD.state = 'QUEUED' AND NEW.state IN ('PREPARING', 'FAILED', 'CANCELLED')) OR
    (OLD.state = 'PREPARING' AND NEW.state IN ('IMPLEMENTING', 'FAILED', 'CANCELLED')) OR
    (OLD.state = 'IMPLEMENTING' AND NEW.state IN ('VALIDATING', 'FAILED', 'CANCELLED')) OR
    (OLD.state = 'VALIDATING' AND NEW.state IN ('IMPLEMENTING', 'COMMITTING', 'FAILED', 'CANCELLED')) OR
    (OLD.state = 'COMMITTING' AND NEW.state IN ('DEPLOYING_PREVIEW', 'FAILED')) OR
    (OLD.state = 'DEPLOYING_PREVIEW' AND NEW.state IN ('VERIFYING_PREVIEW', 'FAILED')) OR
    (OLD.state = 'VERIFYING_PREVIEW' AND NEW.state IN ('READY_FOR_REVIEW', 'FAILED')) OR
    (OLD.state = 'READY_FOR_REVIEW' AND NEW.state IN ('PROMOTING', 'COMPLETED', 'REJECTED')) OR
    (OLD.state = 'PROMOTING' AND NEW.state IN ('COMPLETED', 'FAILED', 'ROLLED_BACK'))
  ) THEN
    RAISE EXCEPTION 'invalid run state transition from % to %', OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER runs_enforce_state_transition
BEFORE UPDATE ON runs
FOR EACH ROW EXECUTE FUNCTION enforce_run_state_transition();
--> statement-breakpoint

CREATE FUNCTION enforce_single_approval_decision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.decision <> 'pending' OR NEW.decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'approval decisions are final and cannot be relaxed' USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
    OR NEW.plan_revision IS DISTINCT FROM OLD.plan_revision
    OR NEW.gate IS DISTINCT FROM OLD.gate
    OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
  THEN
    RAISE EXCEPTION 'approval request identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER approvals_enforce_single_decision
BEFORE UPDATE ON approvals
FOR EACH ROW EXECUTE FUNCTION enforce_single_approval_decision();
