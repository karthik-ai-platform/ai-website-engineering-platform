import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defaultMigrationsFolder } from './migrate.js'

const organizationId = '00000000-0000-4000-8000-000000000300'
const projectId = '00000000-0000-4000-8000-000000000301'
const changeRequestId = '00000000-0000-4000-8000-000000000302'
const requirementId = '00000000-0000-4000-8000-000000000303'
const planId = '00000000-0000-4000-8000-000000000304'
const runId = '00000000-0000-4000-8000-000000000305'
const approvalId = '00000000-0000-4000-8000-000000000306'

describe('M07 plan and approval migration', () => {
  let database: PGlite

  beforeEach(async () => {
    database = new PGlite()
    await migrate(drizzle(database), { migrationsFolder: defaultMigrationsFolder })
    await database.query(
      `INSERT INTO organizations (id, name, slug) VALUES ($1, 'M07 organization', 'm07-organization')`,
      [organizationId],
    )
    await database.query(
      `INSERT INTO projects (id, organization_id, name, slug) VALUES ($1, $2, 'M07 project', 'm07-project')`,
      [projectId, organizationId],
    )
    await database.query(
      `INSERT INTO change_requests (
        id, organization_id, project_id, actor_id, actor_type, idempotency_key, original_prompt,
        mode, target, constraints, attachments, status, created_at
      ) VALUES ($1, $2, $3, '00000000-0000-4000-8000-000000000399', 'user',
        'm07-fixture', 'Add authentication', 'builder', 'preview', '[]', '[]', 'requirements_review', now())`,
      [changeRequestId, organizationId, projectId],
    )
    await database.query(
      `INSERT INTO requirement_specs (
        id, organization_id, project_id, change_request_id, schema_version,
        revision, body, assumptions, created_at
      ) VALUES ($1, $2, $3, $4, '1', 1, '{}', '[]', now())`,
      [requirementId, organizationId, projectId, changeRequestId],
    )
    await database.query(
      `INSERT INTO execution_plans (
        id, organization_id, project_id, change_request_id, requirement_id, schema_version,
        revision, base_commit, risk_class, body, policy_snapshot, idempotency_key, created_at
      ) VALUES ($1, $2, $3, $4, $5, '1', 1, $6, 'high', '{}', '{}', 'm07-plan-fixture', now())`,
      [planId, organizationId, projectId, changeRequestId, requirementId, 'a'.repeat(40)],
    )
    await database.query(
      `INSERT INTO runs (
        id, organization_id, project_id, change_request_id, execution_plan_id,
        base_commit, state, policy_snapshot, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'AWAITING_APPROVAL', '{}', now())`,
      [runId, organizationId, projectId, changeRequestId, planId, 'a'.repeat(40)],
    )
  })

  afterEach(async () => database.close())

  it('creates tenant-scoped plan, run, and approval tables', async () => {
    const result = await database.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('execution_plans', 'runs', 'approvals')
      ORDER BY table_name
    `)
    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      'approvals',
      'execution_plans',
      'runs',
    ])
    await expect(
      database.query(
        `INSERT INTO execution_plans (
          id, organization_id, project_id, change_request_id, requirement_id, schema_version,
          revision, base_commit, risk_class, body, policy_snapshot, created_at
        ) VALUES ('00000000-0000-4000-8000-000000000398',
          '00000000-0000-4000-8000-000000000397', $1, $2, $3, '1', 2, $4,
          'low', '{}', '{}', now())`,
        [projectId, changeRequestId, requirementId, 'b'.repeat(40)],
      ),
    ).rejects.toThrow()
    await expect(
      database.query(
        `INSERT INTO execution_plans (
          id, organization_id, project_id, change_request_id, requirement_id, schema_version,
          revision, base_commit, risk_class, body, policy_snapshot, idempotency_key, created_at
        ) VALUES ('00000000-0000-4000-8000-000000000396', $1, $2, $3, $4,
          '1', 2, $5, 'high', '{}', '{}', 'm07-plan-fixture', now())`,
        [organizationId, projectId, changeRequestId, requirementId, 'b'.repeat(40)],
      ),
    ).rejects.toThrow()
  })

  it('keeps accepted plans append-only and rejects skipped run transitions', async () => {
    await expect(
      database.query(`UPDATE execution_plans SET risk_class = 'low' WHERE id = $1`, [planId]),
    ).rejects.toThrow(/append-only/u)
    await expect(
      database.query(`UPDATE runs SET state = 'PREPARING' WHERE id = $1`, [runId]),
    ).rejects.toThrow(/invalid run state transition/u)
  })

  it('allows one attributed approval decision and then makes it final', async () => {
    await database.query(
      `INSERT INTO approvals (
        id, organization_id, project_id, run_id, plan_id, plan_revision, gate, decision,
        requester_id, policy_version, idempotency_key, requested_at
      ) VALUES ($1, $2, $3, $4, $5, 1, 'plan_execution', 'pending',
        '00000000-0000-4000-8000-000000000307', 'policy-v1', 'approval-fixture', now())`,
      [approvalId, organizationId, projectId, runId, planId],
    )
    await database.query(
      `UPDATE approvals SET decision = 'approved',
        approver_id = '00000000-0000-4000-8000-000000000308',
        rationale = 'Reviewed', decided_at = now() WHERE id = $1`,
      [approvalId],
    )
    await expect(
      database.query(`UPDATE approvals SET rationale = 'Relaxed' WHERE id = $1`, [approvalId]),
    ).rejects.toThrow(/final/u)
  })
})
