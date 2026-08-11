import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultMigrationsFolder } from './migrate.js'

describe('M02 projects and RBAC migration', () => {
  let database: PGlite
  beforeEach(async () => {
    database = new PGlite()
    await migrate(drizzle(database), { migrationsFolder: defaultMigrationsFolder })
  })
  afterEach(async () => database.close())

  it('creates policy and service identity storage', async () => {
    const result = await database.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('policy_profiles', 'service_identities', 'service_identity_permissions')
      ORDER BY table_name`)
    expect(result.rows.map((row) => row.table_name)).toEqual([
      'policy_profiles',
      'service_identities',
      'service_identity_permissions',
    ])
  })

  it('rejects cross-tenant policy and service project references', async () => {
    const first = '00000000-0000-4000-8000-000000000001'
    const second = '00000000-0000-4000-8000-000000000002'
    const policy = '00000000-0000-4000-8000-000000000003'
    const project = '00000000-0000-4000-8000-000000000004'
    await database.query(
      `INSERT INTO organizations (id,name,slug) VALUES ($1,'First','first'),($2,'Second','second')`,
      [first, second],
    )
    await database.query(
      `INSERT INTO policy_profiles (id,organization_id,name) VALUES ($1,$2,'Default')`,
      [policy, first],
    )
    await expect(
      database.query(
        `INSERT INTO projects (id,organization_id,name,slug,policy_id) VALUES ($1,$2,'Bad','bad',$3)`,
        [project, second, policy],
      ),
    ).rejects.toThrow()
    await database.query(
      `INSERT INTO projects (id,organization_id,name,slug,policy_id) VALUES ($1,$2,'Good','good',$3)`,
      [project, first, policy],
    )
    await expect(
      database.query(
        `INSERT INTO service_identities (id,organization_id,project_id,name) VALUES (
      '00000000-0000-4000-8000-000000000005',$1,$2,'Bad service')`,
        [second, project],
      ),
    ).rejects.toThrow()
  })

  it('enforces membership status and scoped service permissions', async () => {
    const organization = '00000000-0000-4000-8000-000000000010'
    const user = '00000000-0000-4000-8000-000000000011'
    const service = '00000000-0000-4000-8000-000000000012'
    await database.query(`INSERT INTO organizations (id,name,slug) VALUES ($1,'Org','org')`, [
      organization,
    ])
    await database.query(
      `INSERT INTO users (id,identity_provider_id,display_name) VALUES ($1,'idp:test','Test')`,
      [user],
    )
    await expect(
      database.query(
        `INSERT INTO memberships (organization_id,user_id,role,status)
      VALUES ($1,$2,'viewer','unknown')`,
        [organization, user],
      ),
    ).rejects.toThrow()
    await database.query(
      `INSERT INTO service_identities (id,organization_id,name) VALUES ($1,$2,'Worker')`,
      [service, organization],
    )
    await expect(
      database.query(
        `INSERT INTO service_identity_permissions (organization_id,service_identity_id,permission)
      VALUES ($1,$2,'unbounded:admin')`,
        [organization, service],
      ),
    ).rejects.toThrow()
  })
})
