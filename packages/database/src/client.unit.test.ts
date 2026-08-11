import { describe, expect, it } from 'vitest'

import { createLazyPostgresConnection } from './client.js'

describe('createLazyPostgresConnection', () => {
  it('does not initialize the PostgreSQL driver until first use', async () => {
    const connection = createLazyPostgresConnection({
      databaseUrl: 'postgres://unused.invalid/platform_test',
    })

    expect(connection.initialized).toBe(false)

    await connection.close()

    expect(connection.initialized).toBe(false)
  })

  it('rejects an empty database URL before creating a driver', () => {
    expect(() => createLazyPostgresConnection({ databaseUrl: '   ' })).toThrow(
      /non-empty PostgreSQL database URL/,
    )
  })
})
