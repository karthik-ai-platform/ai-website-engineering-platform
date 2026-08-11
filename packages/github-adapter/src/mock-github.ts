import type {
  GithubRepositoryConnectionV1,
  GithubRepositoryMetadataV1,
  ProjectV1,
  ProviderRequestContextV1,
} from '@platform/contracts'
import type {
  GithubConnectionAttempt,
  GithubOnboardingStore,
  HumanMembership,
  ProjectAuditEvent,
  ServiceGrant,
} from '@platform/domain'

import type { GithubInstallationClient } from './github-app-adapter.js'

export class MockGithubInstallationClient implements GithubInstallationClient {
  accessible = true

  constructor(readonly metadata: GithubRepositoryMetadataV1) {}

  inspectRepository(
    _context: ProviderRequestContextV1,
    installationId: string,
    repositoryId: string,
  ) {
    const matches =
      this.metadata.installationId === installationId && this.metadata.repositoryId === repositoryId
    return Promise.resolve({
      accessible: this.accessible && matches,
      ...(this.accessible && matches ? { metadata: this.metadata } : {}),
    })
  }
}

export class MemoryGithubOnboardingStore implements GithubOnboardingStore {
  readonly attempts = new Map<string, GithubConnectionAttempt>()
  readonly audits: ProjectAuditEvent[] = []
  readonly connections = new Map<string, GithubRepositoryConnectionV1>()
  readonly memberships = new Map<string, HumanMembership>()
  readonly projects = new Map<string, ProjectV1>()
  readonly serviceGrants = new Map<string, ServiceGrant>()

  findHumanMembership(organizationId: string, actorId: string) {
    return Promise.resolve(this.memberships.get(`${organizationId}:${actorId}`))
  }

  findServiceGrant(organizationId: string, actorId: string) {
    return Promise.resolve(this.serviceGrants.get(`${organizationId}:${actorId}`))
  }

  findProject(organizationId: string, projectId: string) {
    return Promise.resolve(this.projects.get(`${organizationId}:${projectId}`))
  }

  createAttempt(attempt: GithubConnectionAttempt): Promise<void> {
    this.attempts.set(attempt.id, attempt)
    return Promise.resolve()
  }

  consumeAttempt(
    attemptId: string,
    organizationId: string,
    projectId: string,
    actorId: string,
    stateDigest: string,
    consumedAt: Date,
  ): Promise<boolean> {
    const attempt = this.attempts.get(attemptId)
    if (
      attempt === undefined ||
      attempt.organizationId !== organizationId ||
      attempt.projectId !== projectId ||
      attempt.actorId !== actorId ||
      attempt.stateDigest !== stateDigest ||
      attempt.consumedAt !== undefined ||
      attempt.expiresAt < consumedAt
    ) {
      return Promise.resolve(false)
    }
    this.attempts.set(attemptId, { ...attempt, consumedAt })
    return Promise.resolve(true)
  }

  findConnection(organizationId: string, projectId: string) {
    return Promise.resolve(this.connections.get(`${organizationId}:${projectId}`))
  }

  saveConnection(connection: GithubRepositoryConnectionV1): Promise<void> {
    this.connections.set(`${connection.organizationId}:${connection.projectId}`, connection)
    return Promise.resolve()
  }

  appendAuditEvent(event: ProjectAuditEvent): Promise<void> {
    this.audits.push(event)
    return Promise.resolve()
  }
}
