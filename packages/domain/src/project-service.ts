import { randomUUID } from 'node:crypto'

import type {
  ActorContextV1,
  CreateProjectRequestV1,
  ProjectLifecycleActionV1,
  ProjectPermissionV1,
  ProjectV1,
} from '@platform/contracts'

import { authorize, type HumanMembership, type ServiceGrant } from './authorization.js'
import { PlatformError } from './error.js'

export interface ProjectPolicyReference {
  readonly id: string
  readonly deletionRetentionDays: number
  readonly status: 'active' | 'retired'
}

export interface ProjectAuditEvent {
  readonly id: string
  readonly schemaVersion: '1'
  readonly organizationId: string
  readonly projectId?: string
  readonly actorRef: string
  readonly action: string
  readonly targetRef: string
  readonly outcome: 'allowed' | 'denied' | 'succeeded' | 'failed'
  readonly correlationId: string
  readonly payloadRef?: string
  readonly occurredAt: Date
}

export interface ProjectStore {
  findHumanMembership(organizationId: string, actorId: string): Promise<HumanMembership | undefined>
  findServiceGrant(organizationId: string, actorId: string): Promise<ServiceGrant | undefined>
  findPolicy(organizationId: string, policyId: string): Promise<ProjectPolicyReference | undefined>
  findProject(organizationId: string, projectId: string): Promise<ProjectV1 | undefined>
  createProject(project: ProjectV1, auditEvent: ProjectAuditEvent): Promise<void>
  updateProject(project: ProjectV1, auditEvent: ProjectAuditEvent): Promise<void>
  appendAuditEvent(event: ProjectAuditEvent): Promise<void>
}

export interface ProjectServiceOptions {
  readonly clock?: () => Date
  readonly idFactory?: () => string
  readonly store: ProjectStore
}

export class ProjectService {
  readonly #clock: () => Date
  readonly #idFactory: () => string
  readonly #store: ProjectStore

  constructor(options: ProjectServiceOptions) {
    this.#clock = options.clock ?? (() => new Date())
    this.#idFactory = options.idFactory ?? randomUUID
    this.#store = options.store
  }

  async create(actor: ActorContextV1, request: CreateProjectRequestV1): Promise<ProjectV1> {
    const now = this.#clock()
    await this.#requirePermission(actor, request.organizationId, 'project:create', undefined, now)
    const policy = await this.#store.findPolicy(request.organizationId, request.policyId)
    if (policy?.status !== 'active')
      throw this.#error(actor, 'NOT_FOUND', 'The project policy was not found.')

    const project: ProjectV1 = {
      schemaVersion: '1',
      id: this.#idFactory(),
      organizationId: request.organizationId,
      name: request.name,
      slug: request.slug,
      pluginType: 'website',
      policyId: policy.id,
      status: 'active',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    await this.#store.createProject(
      project,
      this.#audit(actor, project, 'project.created', 'succeeded', now),
    )
    return project
  }

  async transition(
    actor: ActorContextV1,
    organizationId: string,
    projectId: string,
    action: ProjectLifecycleActionV1,
    expectedUpdatedAt?: string,
  ): Promise<ProjectV1> {
    const now = this.#clock()
    const permission = `project:${action}` as ProjectPermissionV1
    await this.#requirePermission(actor, organizationId, permission, projectId, now)
    const current = await this.#store.findProject(organizationId, projectId)
    if (current === undefined) throw this.#error(actor, 'NOT_FOUND', 'The project was not found.')
    if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) {
      throw this.#error(actor, 'CONFLICT', 'The project changed before this action could execute.')
    }

    const updated = await this.#applyTransition(actor, current, action, now)
    await this.#store.updateProject(
      updated,
      this.#audit(actor, updated, `project.${action}d`, 'succeeded', now),
    )
    return updated
  }

  async #applyTransition(
    actor: ActorContextV1,
    current: ProjectV1,
    action: ProjectLifecycleActionV1,
    now: Date,
  ): Promise<ProjectV1> {
    if (action === 'archive' && current.status === 'active') {
      return {
        ...current,
        status: 'archived',
        archivedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }
    }
    if (
      action === 'restore' &&
      (current.status === 'archived' || current.status === 'deletion_pending')
    ) {
      const restored = { ...current }
      delete restored.deletionRequestedAt
      delete restored.retentionUntil
      delete restored.deletedAt
      return { ...restored, status: 'active', updatedAt: now.toISOString() }
    }
    if (action === 'delete' && current.status !== 'deleted') {
      const policy = await this.#store.findPolicy(current.organizationId, current.policyId)
      if (policy === undefined)
        throw this.#error(actor, 'NOT_FOUND', 'The project policy was not found.')
      const retentionUntil = new Date(now)
      retentionUntil.setUTCDate(retentionUntil.getUTCDate() + policy.deletionRetentionDays)
      return {
        ...current,
        status: policy.deletionRetentionDays === 0 ? 'deleted' : 'deletion_pending',
        deletionRequestedAt: now.toISOString(),
        retentionUntil: retentionUntil.toISOString(),
        ...(policy.deletionRetentionDays === 0 ? { deletedAt: now.toISOString() } : {}),
        updatedAt: now.toISOString(),
      }
    }
    throw this.#error(
      actor,
      'INVALID_TRANSITION',
      `Project cannot ${action} from ${current.status}.`,
    )
  }

  async #requirePermission(
    actor: ActorContextV1,
    organizationId: string,
    permission: ProjectPermissionV1,
    projectId: string | undefined,
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
      decidedAt: now,
      ...(membership === undefined ? {} : { membership }),
      ...(serviceGrant === undefined ? {} : { serviceGrant }),
      organizationId,
      permission,
      ...(projectId === undefined ? {} : { projectId }),
    })
    await this.#store.appendAuditEvent({
      id: this.#idFactory(),
      schemaVersion: '1',
      organizationId,
      ...(projectId === undefined ? {} : { projectId }),
      actorRef: `${actor.actorType}:${actor.actorId}`,
      action: `authorization.${permission}`,
      targetRef:
        projectId === undefined ? `organization:${organizationId}` : `project:${projectId}`,
      outcome: decision.allowed ? 'allowed' : 'denied',
      correlationId: actor.correlationId,
      payloadRef: `reason:${decision.reason}`,
      occurredAt: now,
    })
    if (!decision.allowed)
      throw this.#error(
        actor,
        'AUTHORIZATION_DENIED',
        'You are not authorized to perform this action.',
      )
  }

  #audit(
    actor: ActorContextV1,
    project: ProjectV1,
    action: string,
    outcome: ProjectAuditEvent['outcome'],
    occurredAt: Date,
  ): ProjectAuditEvent {
    return {
      id: this.#idFactory(),
      schemaVersion: '1',
      organizationId: project.organizationId,
      projectId: project.id,
      actorRef: `${actor.actorType}:${actor.actorId}`,
      action,
      targetRef: `project:${project.id}`,
      outcome,
      correlationId: actor.correlationId,
      occurredAt,
    }
  }

  #error(
    actor: ActorContextV1,
    code: ConstructorParameters<typeof PlatformError>[0]['code'],
    safeMessage: string,
  ): PlatformError {
    return new PlatformError({
      code,
      correlationId: actor.correlationId,
      retryable: false,
      safeMessage,
    })
  }
}
