import { createHash, randomBytes, randomUUID } from 'node:crypto'

import {
  githubConnectionInitiationRequestV1Schema,
  githubConnectionInitiationResultV1Schema,
  githubInstallationSelectionV1Schema,
  githubRepositoryConnectionV1Schema,
  type ActorContextV1,
  type GithubConnectionInitiationRequestV1,
  type GithubConnectionInitiationResultV1,
  type GithubInstallationSelectionV1,
  type GithubRepositoryConnectionV1,
  type ProjectV1,
  type ProviderRequestContextV1,
  type SecretReferenceV1,
} from '@platform/contracts'

import { authorize, type HumanMembership, type ServiceGrant } from './authorization.js'
import { PlatformError } from './error.js'
import type { GithubAppOnboardingPort, SecretsPort } from './provider-ports.js'
import type { ProjectAuditEvent } from './project-service.js'

export interface GithubConnectionAttempt {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly actorId: string
  readonly returnUrl: string
  readonly stateDigest: string
  readonly expiresAt: Date
  readonly consumedAt?: Date
}

export interface GithubOnboardingStore {
  findHumanMembership(organizationId: string, actorId: string): Promise<HumanMembership | undefined>
  findServiceGrant(organizationId: string, actorId: string): Promise<ServiceGrant | undefined>
  findProject(organizationId: string, projectId: string): Promise<ProjectV1 | undefined>
  createAttempt(attempt: GithubConnectionAttempt): Promise<void>
  consumeAttempt(
    attemptId: string,
    organizationId: string,
    projectId: string,
    actorId: string,
    stateDigest: string,
    consumedAt: Date,
  ): Promise<boolean>
  findConnection(
    organizationId: string,
    projectId: string,
  ): Promise<GithubRepositoryConnectionV1 | undefined>
  saveConnection(connection: GithubRepositoryConnectionV1): Promise<void>
  appendAuditEvent(event: ProjectAuditEvent): Promise<void>
}

export interface GithubOnboardingServiceOptions {
  readonly adapter: GithubAppOnboardingPort
  readonly appCredentialRef: SecretReferenceV1
  readonly clock?: () => Date
  readonly idFactory?: () => string
  readonly secrets: SecretsPort
  readonly stateFactory?: () => string
  readonly store: GithubOnboardingStore
}

export class GithubOnboardingService {
  readonly #adapter: GithubAppOnboardingPort
  readonly #appCredentialRef: SecretReferenceV1
  readonly #clock: () => Date
  readonly #idFactory: () => string
  readonly #secrets: SecretsPort
  readonly #stateFactory: () => string
  readonly #store: GithubOnboardingStore

  constructor(options: GithubOnboardingServiceOptions) {
    this.#adapter = options.adapter
    this.#appCredentialRef = options.appCredentialRef
    this.#clock = options.clock ?? (() => new Date())
    this.#idFactory = options.idFactory ?? randomUUID
    this.#secrets = options.secrets
    this.#stateFactory = options.stateFactory ?? (() => randomBytes(32).toString('base64url'))
    this.#store = options.store
  }

  async initiate(
    actor: ActorContextV1,
    input: GithubConnectionInitiationRequestV1,
  ): Promise<GithubConnectionInitiationResultV1> {
    const request = githubConnectionInitiationRequestV1Schema.parse(input)
    const now = this.#clock()
    await this.#requirePermission(actor, request.organizationId, request.projectId, now)
    await this.#requireActiveProject(actor, request.organizationId, request.projectId)
    const context = this.#context(actor, request.organizationId, request.projectId, now)
    if (!(await this.#secrets.exists(context, this.#appCredentialRef))) {
      throw this.#error(
        actor,
        'DEPENDENCY_UNAVAILABLE',
        'GitHub App credentials are unavailable.',
        true,
      )
    }

    const attemptId = this.#idFactory()
    const state = this.#stateFactory()
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000)
    await this.#store.createAttempt({
      id: attemptId,
      organizationId: request.organizationId,
      projectId: request.projectId,
      actorId: actor.actorId,
      returnUrl: request.returnUrl,
      stateDigest: digest(state),
      expiresAt,
    })
    const provider = await this.#adapter.initiateInstallation(context, {
      returnUrl: request.returnUrl,
      state,
    })
    await this.#store.appendAuditEvent(
      this.#audit(
        actor,
        request.organizationId,
        request.projectId,
        'github.connection_initiated',
        now,
      ),
    )
    return githubConnectionInitiationResultV1Schema.parse({
      schemaVersion: '1',
      attemptId,
      authorizationUrl: provider.authorizationUrl,
      expiresAt: expiresAt.toISOString(),
    })
  }

  async complete(
    actor: ActorContextV1,
    input: GithubInstallationSelectionV1,
  ): Promise<GithubRepositoryConnectionV1> {
    const selection = githubInstallationSelectionV1Schema.parse(input)
    const now = this.#clock()
    await this.#requirePermission(actor, selection.organizationId, selection.projectId, now)
    await this.#requireActiveProject(actor, selection.organizationId, selection.projectId)
    const consumed = await this.#store.consumeAttempt(
      selection.attemptId,
      selection.organizationId,
      selection.projectId,
      actor.actorId,
      digest(selection.state),
      now,
    )
    if (!consumed) {
      throw this.#error(
        actor,
        'AUTHORIZATION_DENIED',
        'The GitHub connection state is invalid or expired.',
      )
    }

    const verification = await this.#adapter.verifyRepository(
      this.#context(actor, selection.organizationId, selection.projectId, now),
      { installationId: selection.installationId, repositoryId: selection.repositoryId },
    )
    if (!verification.accessible || verification.metadata === undefined) {
      throw this.#error(
        actor,
        'AUTHORIZATION_DENIED',
        'The GitHub installation cannot access this repository.',
      )
    }
    const metadata = verification.metadata
    if (
      metadata.installationId !== selection.installationId ||
      metadata.repositoryId !== selection.repositoryId
    ) {
      throw this.#error(
        actor,
        'DEPENDENCY_UNAVAILABLE',
        'GitHub returned inconsistent repository identity.',
        true,
      )
    }
    const readiness =
      metadata.permissions.metadata === 'read' && metadata.permissions.contents === 'read'
        ? 'ready'
        : 'insufficient_permissions'
    const connection = githubRepositoryConnectionV1Schema.parse({
      schemaVersion: '1',
      id: this.#idFactory(),
      organizationId: selection.organizationId,
      projectId: selection.projectId,
      provider: 'github',
      installationId: metadata.installationId,
      repositoryId: metadata.repositoryId,
      owner: metadata.owner,
      name: metadata.name,
      permissions: metadata.permissions,
      defaultBranch: metadata.defaultBranch,
      indexedCommit: metadata.indexedCommit,
      appCredentialRef: this.#appCredentialRef,
      readiness,
      mutationEnabled: false,
      metadata: {
        framework: null,
        packageManager: null,
        buildCommand: null,
        testCommand: null,
        detectionStatus: 'pending',
      },
      connectedAt: now.toISOString(),
      verifiedAt: now.toISOString(),
    })
    await this.#store.saveConnection(connection)
    await this.#store.appendAuditEvent(
      this.#audit(
        actor,
        selection.organizationId,
        selection.projectId,
        'github.repository_connected',
        now,
      ),
    )
    return connection
  }

  async refreshAccess(
    actor: ActorContextV1,
    organizationId: string,
    projectId: string,
  ): Promise<GithubRepositoryConnectionV1> {
    const now = this.#clock()
    await this.#requirePermission(actor, organizationId, projectId, now)
    const current = await this.#store.findConnection(organizationId, projectId)
    if (current === undefined) {
      throw this.#error(actor, 'NOT_FOUND', 'The GitHub repository connection was not found.')
    }
    const verification = await this.#adapter.verifyRepository(
      this.#context(actor, organizationId, projectId, now),
      { installationId: current.installationId, repositoryId: current.repositoryId },
    )
    const updated = githubRepositoryConnectionV1Schema.parse({
      ...current,
      ...(verification.metadata === undefined
        ? {}
        : {
            permissions: verification.metadata.permissions,
            defaultBranch: verification.metadata.defaultBranch,
            indexedCommit: verification.metadata.indexedCommit,
          }),
      readiness:
        !verification.accessible || verification.metadata === undefined
          ? 'access_lost'
          : verification.metadata.permissions.contents === 'read'
            ? 'ready'
            : 'insufficient_permissions',
      verifiedAt: now.toISOString(),
    })
    await this.#store.saveConnection(updated)
    await this.#store.appendAuditEvent(
      this.#audit(actor, organizationId, projectId, 'github.repository_access_refreshed', now),
    )
    return updated
  }

  async #requireActiveProject(
    actor: ActorContextV1,
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    const project = await this.#store.findProject(organizationId, projectId)
    if (project?.status !== 'active') {
      throw this.#error(actor, 'NOT_FOUND', 'The active project was not found.')
    }
  }

  async #requirePermission(
    actor: ActorContextV1,
    organizationId: string,
    projectId: string,
    now: Date,
  ): Promise<void> {
    const [membership, serviceGrant] = await Promise.all([
      actor.actorType === 'user'
        ? this.#store.findHumanMembership(organizationId, actor.actorId)
        : undefined,
      actor.actorType === 'service'
        ? this.#store.findServiceGrant(organizationId, actor.actorId)
        : undefined,
    ])
    const decision = authorize({
      actor,
      correlationId: actor.correlationId,
      ...(membership === undefined ? {} : { membership }),
      ...(serviceGrant === undefined ? {} : { serviceGrant }),
      organizationId,
      permission: 'repository:connect',
      projectId,
      decidedAt: now,
    })
    await this.#store.appendAuditEvent({
      ...this.#audit(actor, organizationId, projectId, 'authorization.repository:connect', now),
      outcome: decision.allowed ? 'allowed' : 'denied',
      payloadRef: `reason:${decision.reason}`,
    })
    if (!decision.allowed) {
      throw this.#error(
        actor,
        'AUTHORIZATION_DENIED',
        'You are not authorized to connect a repository.',
      )
    }
  }

  #context(
    actor: ActorContextV1,
    organizationId: string,
    projectId: string,
    requestedAt: Date,
  ): ProviderRequestContextV1 {
    return {
      schemaVersion: '1',
      organizationId,
      projectId,
      actorRef: `${actor.actorType}:${actor.actorId}`,
      correlationId: actor.correlationId,
      idempotencyKey: `github-onboarding-${actor.correlationId}`,
      requestedAt: requestedAt.toISOString(),
    }
  }

  #audit(
    actor: ActorContextV1,
    organizationId: string,
    projectId: string,
    action: string,
    occurredAt: Date,
  ): ProjectAuditEvent {
    return {
      id: this.#idFactory(),
      schemaVersion: '1',
      organizationId,
      projectId,
      actorRef: `${actor.actorType}:${actor.actorId}`,
      action,
      targetRef: `project:${projectId}`,
      outcome: 'succeeded',
      correlationId: actor.correlationId,
      occurredAt,
    }
  }

  #error(
    actor: ActorContextV1,
    code: ConstructorParameters<typeof PlatformError>[0]['code'],
    safeMessage: string,
    retryable = false,
  ): PlatformError {
    return new PlatformError({ code, correlationId: actor.correlationId, retryable, safeMessage })
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
