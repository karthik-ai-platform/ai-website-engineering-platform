-- Migration: 0006_m07_plan_idempotency
-- Purpose: Add durable tenant-scoped idempotency keys for M07 plan creation.
--
-- Forward procedure:
--   1. Verify target, backup/PITR point, and that 0001-0005 are applied.
--   2. Apply with the package migration runner.
--   3. Verify the partial tenant/project/idempotency uniqueness constraint.
--
-- Recovery guidance:
--   Roll back the application while retaining the nullable additive column.
--   Correct defects with a reviewed forward migration. In a disposable
--   local/test database only, drop the index and column. Production recovery
--   uses the approved backup/PITR procedure and retains accepted plan history.

ALTER TABLE execution_plans
  ADD COLUMN idempotency_key text
  CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 8 AND 256);
--> statement-breakpoint

CREATE UNIQUE INDEX execution_plans_tenant_idempotency_unique
  ON execution_plans (organization_id, project_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
