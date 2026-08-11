import {
  githubRepositoryConnectionV1Schema,
  type GithubRepositoryConnectionV1,
} from '@platform/contracts'
import {
  githubConnectionAttempts,
  repositoryConnections,
  type PlatformDatabase,
} from '@platform/database'
import type {
  GithubConnectionAttempt,
  GithubOnboardingStore,
  ProjectAuditEvent,
} from '@platform/domain'
import { and, eq, gte, isNull } from 'drizzle-orm'

import { PostgresProjectStore } from './postgres-project-store.js'

export class PostgresGithubOnboardingStore implements GithubOnboardingStore {
  readonly #projects: PostgresProjectStore

  constructor(private readonly database: PlatformDatabase) {
    this.#projects = new PostgresProjectStore(database)
  }

  findHumanMembership(organizationId: string, actorId: string) {
    return this.#projects.findHumanMembership(organizationId, actorId)
  }

  findServiceGrant(organizationId: string, actorId: string) {
    return this.#projects.findServiceGrant(organizationId, actorId)
  }

  findProject(organizationId: string, projectId: string) {
    return this.#projects.findProject(organizationId, projectId)
  }

  createAttempt(attempt: GithubConnectionAttempt): Promise<void> {
    return this.database
      .insert(githubConnectionAttempts)
      .values({
        id: attempt.id,
        organizationId: attempt.organizationId,
        projectId: attempt.projectId,
        actorId: attempt.actorId,
        stateDigest: attempt.stateDigest,
        returnUrl: attempt.returnUrl,
        expiresAt: attempt.expiresAt,
        consumedAt: attempt.consumedAt ?? null,
      })
      .then(() => undefined)
  }

  async consumeAttempt(
    attemptId: string,
    organizationId: string,
    projectId: string,
    actorId: string,
    stateDigest: string,
    consumedAt: Date,
  ): Promise<boolean> {
    const rows = await this.database
      .update(githubConnectionAttempts)
      .set({ consumedAt })
      .where(
        and(
          eq(githubConnectionAttempts.id, attemptId),
          eq(githubConnectionAttempts.organizationId, organizationId),
          eq(githubConnectionAttempts.projectId, projectId),
          eq(githubConnectionAttempts.actorId, actorId),
          eq(githubConnectionAttempts.stateDigest, stateDigest),
          isNull(githubConnectionAttempts.consumedAt),
          gte(githubConnectionAttempts.expiresAt, consumedAt),
        ),
      )
      .returning({ id: githubConnectionAttempts.id })
    return rows.length === 1
  }

  async findConnection(organizationId: string, projectId: string) {
    const [row] = await this.database
      .select()
      .from(repositoryConnections)
      .where(
        and(
          eq(repositoryConnections.organizationId, organizationId),
          eq(repositoryConnections.projectId, projectId),
        ),
      )
      .limit(1)
    return row === undefined ? undefined : this.parseConnection(row)
  }

  async saveConnection(connection: GithubRepositoryConnectionV1): Promise<void> {
    const values = {
      id: connection.id,
      organizationId: connection.organizationId,
      projectId: connection.projectId,
      provider: connection.provider,
      installationId: connection.installationId,
      repositoryId: connection.repositoryId,
      owner: connection.owner,
      name: connection.name,
      permissions: connection.permissions,
      defaultBranch: connection.defaultBranch,
      indexedCommit: connection.indexedCommit,
      appCredentialRef: connection.appCredentialRef,
      readiness: connection.readiness,
      mutationEnabled: connection.mutationEnabled,
      metadata: connection.metadata,
      connectedAt: new Date(connection.connectedAt),
      verifiedAt: new Date(connection.verifiedAt),
    }
    await this.database
      .insert(repositoryConnections)
      .values(values)
      .onConflictDoUpdate({
        target: [repositoryConnections.organizationId, repositoryConnections.projectId],
        set: values,
      })
  }

  appendAuditEvent(event: ProjectAuditEvent): Promise<void> {
    return this.#projects.appendAuditEvent(event)
  }

  private parseConnection(row: typeof repositoryConnections.$inferSelect) {
    return githubRepositoryConnectionV1Schema.parse({
      schemaVersion: '1',
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      provider: row.provider,
      installationId: row.installationId,
      repositoryId: row.repositoryId,
      owner: row.owner,
      name: row.name,
      permissions: row.permissions,
      defaultBranch: row.defaultBranch,
      indexedCommit: row.indexedCommit,
      appCredentialRef: row.appCredentialRef,
      readiness: row.readiness,
      mutationEnabled: row.mutationEnabled,
      metadata: row.metadata,
      connectedAt: row.connectedAt.toISOString(),
      verifiedAt: row.verifiedAt.toISOString(),
    })
  }
}
