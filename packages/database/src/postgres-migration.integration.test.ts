import { describe, expect, it } from 'vitest'

import { createLazyPostgresConnection } from './client.js'
import { runMigrations } from './migrate.js'

const databaseUrl = process.env['DATABASE_MIGRATION_TEST_URL']
const disposableEndpointAcknowledged =
  process.env['DATABASE_MIGRATION_TEST_ACKNOWLEDGE_DISPOSABLE'] === '1'
const liveTestEnabled = databaseUrl !== undefined && disposableEndpointAcknowledged

describe.skipIf(!liveTestEnabled)('live PostgreSQL migration', () => {
  it('applies the foundation to an explicitly acknowledged disposable endpoint', async () => {
    if (databaseUrl === undefined) {
      throw new Error('DATABASE_MIGRATION_TEST_URL is required for this test.')
    }

    await runMigrations({ databaseUrl })

    const connection = createLazyPostgresConnection({
      databaseUrl,
      maxConnections: 1,
    })

    try {
      const result = await connection.client<{ table_name: string }[]>`
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
      `

      expect(result.map(({ table_name }) => table_name)).toEqual([
        'audit_events',
        'memberships',
        'organizations',
        'projects',
        'users',
      ])
    } finally {
      await connection.close()
    }
  })
})
