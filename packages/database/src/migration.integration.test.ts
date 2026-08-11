import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defaultMigrationsFolder } from './migrate.js'

describe('M01 PostgreSQL foundation migration', () => {
  let database: PGlite

  beforeEach(async () => {
    database = new PGlite()
    await migrate(drizzle(database), {
      migrationsFolder: defaultMigrationsFolder,
    })
  })

  afterEach(async () => {
    await database.close()
  })

  it('creates the tenant foundation tables', async () => {
    const result = await database.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'users',
          'organizations',
          'memberships',
          'projects',
          'audit_events'
        )
      ORDER BY table_name
    `)

    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      'audit_events',
      'memberships',
      'organizations',
      'projects',
      'users',
    ])
  })

  it('does not provide database-generated UUID defaults', async () => {
    const result = await database.query<{
      column_default: string | null
      table_name: string
    }>(`
      SELECT table_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'id'
        AND table_name IN ('users', 'organizations', 'projects', 'audit_events')
      ORDER BY table_name
    `)

    expect(result.rows).toEqual([
      { table_name: 'audit_events', column_default: null },
      { table_name: 'organizations', column_default: null },
      { table_name: 'projects', column_default: null },
      { table_name: 'users', column_default: null },
    ])
  })

  it('denies UPDATE and DELETE against audit events', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000001'
    const auditEventId = '00000000-0000-4000-8000-000000000002'
    const correlationId = '00000000-0000-4000-8000-000000000003'

    await database.query(
      `INSERT INTO organizations (id, name, slug)
       VALUES ($1, 'Test organization', 'test-organization')`,
      [organizationId],
    )
    await database.query(
      `INSERT INTO audit_events (
         id,
         organization_id,
         actor_ref,
         action,
         target_ref,
         outcome,
         correlation_id
       ) VALUES ($1, $2, 'user:test', 'project.created', 'project:test', 'succeeded', $3)`,
      [auditEventId, organizationId, correlationId],
    )

    await expect(
      database.query("UPDATE audit_events SET outcome = 'failed' WHERE id = $1", [auditEventId]),
    ).rejects.toThrow(/append-only/)

    await expect(
      database.query('DELETE FROM audit_events WHERE id = $1', [auditEventId]),
    ).rejects.toThrow(/append-only/)

    await expect(database.query('TRUNCATE audit_events')).rejects.toThrow(/append-only/)

    const result = await database.query<{ outcome: string }>(
      'SELECT outcome FROM audit_events WHERE id = $1',
      [auditEventId],
    )

    expect(result.rows).toEqual([{ outcome: 'succeeded' }])
  })

  it('can safely re-run the migration journal without reapplying recorded DDL', async () => {
    await migrate(drizzle(database), {
      migrationsFolder: defaultMigrationsFolder,
    })

    const result = await database.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'audit_events'
    `)

    expect(result.rows).toEqual([{ table_name: 'audit_events' }])
  })

  it('rejects a project reference from another organization', async () => {
    const firstOrganizationId = '00000000-0000-4000-8000-000000000010'
    const secondOrganizationId = '00000000-0000-4000-8000-000000000011'
    const projectId = '00000000-0000-4000-8000-000000000012'

    await database.query(
      `INSERT INTO organizations (id, name, slug)
       VALUES
         ($1, 'First organization', 'first-organization'),
         ($2, 'Second organization', 'second-organization')`,
      [firstOrganizationId, secondOrganizationId],
    )
    await database.query(
      `INSERT INTO projects (id, organization_id, name, slug)
       VALUES ($1, $2, 'Tenant project', 'tenant-project')`,
      [projectId, firstOrganizationId],
    )

    await expect(
      database.query(
        `INSERT INTO audit_events (
           id,
           organization_id,
           project_id,
           actor_ref,
           action,
           target_ref,
           outcome,
           correlation_id
         ) VALUES (
           '00000000-0000-4000-8000-000000000013',
           $1,
           $2,
           'user:test',
           'project.updated',
           'project:test',
           'succeeded',
           '00000000-0000-4000-8000-000000000014'
         )`,
        [secondOrganizationId, projectId],
      ),
    ).rejects.toThrow()
  })
})
