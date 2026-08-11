import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'

import * as schema from './schema.js'

export type PlatformDatabase = PostgresJsDatabase<typeof schema>

export interface PostgresConnectionOptions {
  readonly databaseUrl: string
  readonly maxConnections?: number
}

export interface LazyPostgresConnection {
  readonly database: PlatformDatabase
  readonly client: Sql
  readonly initialized: boolean
  close(): Promise<void>
}

interface ConnectionState {
  readonly client: Sql
  readonly database: PlatformDatabase
}

/**
 * Creates a connection holder without opening a socket. The postgres driver is
 * itself lazy, and this wrapper also defers driver construction until a caller
 * first asks for the database or raw client.
 */
export function createLazyPostgresConnection(
  options: PostgresConnectionOptions,
): LazyPostgresConnection {
  if (options.databaseUrl.trim().length === 0) {
    throw new Error('A non-empty PostgreSQL database URL is required.')
  }

  let state: ConnectionState | undefined

  const initialize = (): ConnectionState => {
    state ??= (() => {
      const client = postgres(options.databaseUrl, {
        max: options.maxConnections ?? 10,
      })

      return {
        client,
        database: drizzle(client, { schema }),
      }
    })()

    return state
  }

  return {
    get database() {
      return initialize().database
    },
    get client() {
      return initialize().client
    },
    get initialized() {
      return state !== undefined
    },
    async close() {
      if (state !== undefined) {
        await state.client.end({ timeout: 5 })
        state = undefined
      }
    },
  }
}
