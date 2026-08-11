import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defaultMigrationsFolder } from './migrate.js'

const organizationId = '00000000-0000-4000-8000-000000000100'
const projectId = '00000000-0000-4000-8000-000000000101'
const actorId = '00000000-0000-4000-8000-000000000102'

describe('M04 GitHub onboarding migration', () => {
  let database: PGlite

  beforeEach(async () => {
    database = new PGlite()
    await migrate(drizzle(database), { migrationsFolder: defaultMigrationsFolder })
    await database.query(
      `INSERT INTO organizations (id, name, slug)
       VALUES ($1, 'M04 organization', 'm04-organization')`,
      [organizationId],
    )
    await database.query(
      `INSERT INTO projects (id, organization_id, name, slug)
       VALUES ($1, $2, 'M04 project', 'm04-project')`,
      [projectId, organizationId],
    )
  })

  afterEach(async () => database.close())

  it('creates tenant-scoped onboarding and repository connection tables', async () => {
    const result = await database.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('github_connection_attempts', 'repository_connections')
      ORDER BY table_name
    `)
    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      'github_connection_attempts',
      'repository_connections',
    ])
  })

  it('stores only a state digest and keeps repository mutation disabled', async () => {
    await database.query(
      `INSERT INTO github_connection_attempts (
         id, organization_id, project_id, actor_id, state_digest, return_url, expires_at
       ) VALUES ($1, $2, $3, $4, $5, 'https://platform.example.invalid/return', now() + interval '10 minutes')`,
      ['00000000-0000-4000-8000-000000000103', organizationId, projectId, actorId, 'a'.repeat(64)],
    )
    await expect(
      database.query(
        `INSERT INTO repository_connections (
           id, organization_id, project_id, provider, installation_id, repository_id,
           owner, name, permissions, default_branch, indexed_commit, app_credential_ref,
           readiness, mutation_enabled, metadata, connected_at, verified_at
         ) VALUES (
           '00000000-0000-4000-8000-000000000104', $1, $2, 'github', '101', '202',
           'owner', 'repo', '{"metadata":"read","contents":"read","pullRequests":"none"}',
           'main', $3, '{"schemaVersion":"1","provider":"vault","key":"github/app"}',
           'ready', true, '{"detectionStatus":"pending"}', now(), now()
         )`,
        [organizationId, projectId, 'b'.repeat(40)],
      ),
    ).rejects.toThrow()
  })

  it('accepts the distinct repository connection service permission', async () => {
    const serviceId = '00000000-0000-4000-8000-000000000105'
    await database.query(
      `INSERT INTO service_identities (id, organization_id, project_id, name)
       VALUES ($1, $2, $3, 'GitHub webhook service')`,
      [serviceId, organizationId, projectId],
    )
    await database.query(
      `INSERT INTO service_identity_permissions (
         organization_id, service_identity_id, permission
       ) VALUES ($1, $2, 'repository:connect')`,
      [organizationId, serviceId],
    )
    const result = await database.query<{ permission: string }>(
      `SELECT permission FROM service_identity_permissions WHERE service_identity_id = $1`,
      [serviceId],
    )
    expect(result.rows).toEqual([{ permission: 'repository:connect' }])
  })
})
