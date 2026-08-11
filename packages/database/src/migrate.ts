import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { createLazyPostgresConnection } from './client.js'

export interface MigrationRunnerOptions {
  readonly databaseUrl?: string
  readonly migrationsFolder?: string
}

const packageDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

export const defaultMigrationsFolder = resolve(packageDirectory, 'migrations')

export async function runMigrations(options: MigrationRunnerOptions = {}): Promise<void> {
  const databaseUrl = options.databaseUrl ?? process.env['DATABASE_URL']

  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error(
      'DATABASE_URL is required to run PostgreSQL migrations. Supply it through the protected process environment.',
    )
  }

  const connection = createLazyPostgresConnection({
    databaseUrl,
    maxConnections: 1,
  })

  try {
    await migrate(connection.database, {
      migrationsFolder: options.migrationsFolder ?? defaultMigrationsFolder,
    })
  } finally {
    await connection.close()
  }
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1]

  return entrypoint !== undefined && pathToFileURL(resolve(entrypoint)).href === import.meta.url
}

if (isDirectExecution()) {
  void runMigrations().catch(() => {
    // Do not print an error object: connection errors can contain a database URL.
    console.error('Database migration failed. Inspect protected operational logs for details.')
    process.exitCode = 1
  })
}
