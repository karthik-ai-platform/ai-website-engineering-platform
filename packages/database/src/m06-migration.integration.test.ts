import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defaultMigrationsFolder } from './migrate.js'

const organizationId = '00000000-0000-4000-8000-000000000200'
const projectId = '00000000-0000-4000-8000-000000000201'
const changeRequestId = '00000000-0000-4000-8000-000000000202'

describe('M06 change request migration', () => {
  let database: PGlite

  beforeEach(async () => {
    database = new PGlite()
    await migrate(drizzle(database), { migrationsFolder: defaultMigrationsFolder })
    await database.query(
      `INSERT INTO organizations (id, name, slug) VALUES ($1, 'M06 organization', 'm06-organization')`,
      [organizationId],
    )
    await database.query(
      `INSERT INTO projects (id, organization_id, name, slug) VALUES ($1, $2, 'M06 project', 'm06-project')`,
      [projectId, organizationId],
    )
    await database.query(
      `INSERT INTO change_requests (
        id, organization_id, project_id, actor_id, actor_type, idempotency_key, original_prompt,
        mode, target, constraints, attachments, status, created_at
      ) VALUES ($1, $2, $3, '00000000-0000-4000-8000-000000000203', 'user',
        'fixture-builder', 'Add a hero', 'builder', 'preview', '[]', '[]', 'requirements_pending', now())`,
      [changeRequestId, organizationId, projectId],
    )
  })

  afterEach(async () => database.close())

  it('creates tenant-scoped change request and requirement tables', async () => {
    const result = await database.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('change_requests', 'requirement_specs')
      ORDER BY table_name
    `)
    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      'change_requests',
      'requirement_specs',
    ])
    await expect(
      database.query(
        `INSERT INTO change_requests (
          id, organization_id, project_id, actor_id, actor_type, idempotency_key, original_prompt,
          mode, target, constraints, attachments, status, created_at
        ) VALUES ('00000000-0000-4000-8000-000000000204',
          '00000000-0000-4000-8000-000000000299', $1,
          '00000000-0000-4000-8000-000000000203', 'user', 'fixture-escape', 'Escape tenant',
          'builder', 'preview', '[]', '[]', 'requirements_pending', now())`,
        [projectId],
      ),
    ).rejects.toThrow()
  })

  it('allows status progress but keeps intake fields immutable', async () => {
    await database.query(
      `UPDATE change_requests SET status = 'requirements_review' WHERE id = $1`,
      [changeRequestId],
    )
    await expect(
      database.query(`UPDATE change_requests SET original_prompt = 'Rewritten' WHERE id = $1`, [
        changeRequestId,
      ]),
    ).rejects.toThrow(/immutable/u)
  })

  it('keeps requirement revisions append-only and unique', async () => {
    const body = JSON.stringify({
      schemaVersion: '1',
      id: '00000000-0000-4000-8000-000000000205',
      changeRequestId,
      mode: 'builder',
      summary: 'Add a hero',
      goals: ['Explain value'],
      nonGoals: [],
      assumptions: [],
      questions: [],
      acceptanceCriteria: ['Heading is visible'],
      impactedSurfaces: ['Home page'],
      constraints: [],
      riskSignals: [],
      attachmentIds: [],
      revision: 1,
      createdAt: '2026-08-11T00:00:00.000Z',
    })
    await database.query(
      `INSERT INTO requirement_specs (
        id, organization_id, project_id, change_request_id, schema_version,
        revision, body, assumptions, created_at
      ) VALUES ('00000000-0000-4000-8000-000000000205', $1, $2, $3, '1', 1, $4, '[]', now())`,
      [organizationId, projectId, changeRequestId, body],
    )
    await expect(
      database.query(`UPDATE requirement_specs SET revision = 2 WHERE change_request_id = $1`, [
        changeRequestId,
      ]),
    ).rejects.toThrow(/append-only/u)
    await expect(
      database.query(`DELETE FROM requirement_specs WHERE change_request_id = $1`, [
        changeRequestId,
      ]),
    ).rejects.toThrow(/append-only/u)
  })
})
