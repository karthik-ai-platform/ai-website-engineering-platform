import { randomUUID } from 'node:crypto'

import {
  requirementSpecV1Schema,
  type ActorContextV1,
  type ChangeAttachmentV1,
  type ChangeRequestV1,
  type CreateChangeRequestV1,
  type ProjectPermissionV1,
  type RequirementReviewRequestV1,
  type RequirementSpecV1,
} from '@platform/contracts'

import { authorize, type HumanMembership, type ServiceGrant } from './authorization.js'
import { PlatformError } from './error.js'

export interface RequirementNormalizationEvidence {
  readonly source: 'fixture' | 'ai-cost-controller'
  readonly estimateId?: string
  readonly budgetDecisionId?: string
  readonly routingDecisionId?: string
  readonly pricingVersion?: string
  readonly usageRecordId?: string
}

export interface RequirementRolePort {
  normalize(input: {
    readonly actor: ActorContextV1
    readonly changeRequest: ChangeRequestV1
  }): Promise<{ readonly output: unknown; readonly evidence: RequirementNormalizationEvidence }>
}

export interface AttachmentScannerPort {
  scan(attachment: ChangeAttachmentV1): Promise<'clean' | 'rejected'>
}

export interface ChangeRequestAuditEvent {
  readonly id: string
  readonly schemaVersion: '1'
  readonly organizationId: string
  readonly projectId: string
  readonly actorRef: string
  readonly action: string
  readonly targetRef: string
  readonly outcome: 'allowed' | 'denied' | 'succeeded' | 'failed'
  readonly correlationId: string
  readonly payloadRef?: string
  readonly occurredAt: Date
}

export interface ChangeRequestStore {
  findHumanMembership(organizationId: string, actorId: string): Promise<HumanMembership | undefined>
  findServiceGrant(organizationId: string, actorId: string): Promise<ServiceGrant | undefined>
  findProjectStatus(organizationId: string, projectId: string): Promise<string | undefined>
  findByIdempotencyKey(
    organizationId: string,
    projectId: string,
    idempotencyKey: string,
  ): Promise<ChangeRequestV1 | undefined>
  findChangeRequest(
    organizationId: string,
    projectId: string,
    changeRequestId: string,
  ): Promise<ChangeRequestV1 | undefined>
  findLatestRequirement(
    organizationId: string,
    projectId: string,
    changeRequestId: string,
  ): Promise<RequirementSpecV1 | undefined>
  createChangeRequest(changeRequest: ChangeRequestV1, audit: ChangeRequestAuditEvent): Promise<void>
  saveRequirement(
    changeRequest: ChangeRequestV1,
    requirement: RequirementSpecV1,
    audit: ChangeRequestAuditEvent,
  ): Promise<void>
  appendAuditEvent(event: ChangeRequestAuditEvent): Promise<void>
}

export class ChangeRequestService {
  readonly #clock: () => Date
  readonly #idFactory: () => string
  readonly #scanner: AttachmentScannerPort
  readonly #requirementRole: RequirementRolePort
  readonly #store: ChangeRequestStore

  constructor(options: {
    readonly clock?: () => Date
    readonly idFactory?: () => string
    readonly scanner: AttachmentScannerPort
    readonly requirementRole: RequirementRolePort
    readonly store: ChangeRequestStore
  }) {
    this.#clock = options.clock ?? (() => new Date())
    this.#idFactory = options.idFactory ?? randomUUID
    this.#scanner = options.scanner
    this.#requirementRole = options.requirementRole
    this.#store = options.store
  }

  async create(
    actor: ActorContextV1,
    request: CreateChangeRequestV1,
  ): Promise<{ readonly changeRequest: ChangeRequestV1; readonly requirement: RequirementSpecV1 }> {
    const now = this.#clock()
    await this.#requirePermission(
      actor,
      request.organizationId,
      request.projectId,
      'change:request',
      now,
    )
    if (
      (await this.#store.findProjectStatus(request.organizationId, request.projectId)) !== 'active'
    ) {
      throw this.#error(actor, 'NOT_FOUND', 'The active project was not found.')
    }
    const existing = await this.#store.findByIdempotencyKey(
      request.organizationId,
      request.projectId,
      request.idempotencyKey,
    )
    if (existing !== undefined) {
      const requirement = await this.#store.findLatestRequirement(
        existing.organizationId,
        existing.projectId,
        existing.id,
      )
      if (requirement === undefined) {
        throw this.#error(actor, 'CONFLICT', 'The existing change request is not ready for review.')
      }
      return { changeRequest: existing, requirement }
    }

    const attachments = await Promise.all(
      request.attachments.map(async (attachment) => ({
        ...attachment,
        scanStatus: await this.#scanner.scan(attachment),
      })),
    )
    if (attachments.some((attachment) => attachment.scanStatus !== 'clean')) {
      await this.#store.appendAuditEvent(
        this.#audit(
          actor,
          request.organizationId,
          request.projectId,
          'change.attachment_rejected',
          'failed',
          now,
        ),
      )
      throw this.#error(actor, 'VALIDATION_FAILED', 'An attachment did not pass safety scanning.')
    }

    const changeRequest: ChangeRequestV1 = {
      ...request,
      attachments,
      id: this.#idFactory(),
      actorId: actor.actorId,
      actorType: actor.actorType,
      status: 'requirements_pending',
      createdAt: now.toISOString(),
    }
    await this.#store.createChangeRequest(
      changeRequest,
      this.#audit(
        actor,
        request.organizationId,
        request.projectId,
        'change.created',
        'succeeded',
        now,
        changeRequest.id,
      ),
    )

    const requirement = await this.#normalizeWithOneRetry(actor, changeRequest)
    const reviewable = { ...changeRequest, status: 'requirements_review' as const }
    await this.#store.saveRequirement(
      reviewable,
      requirement,
      this.#audit(
        actor,
        request.organizationId,
        request.projectId,
        'requirement.completed',
        'succeeded',
        now,
        requirement.id,
      ),
    )
    return { changeRequest: reviewable, requirement }
  }

  async correct(
    actor: ActorContextV1,
    request: RequirementReviewRequestV1,
  ): Promise<RequirementSpecV1> {
    const now = this.#clock()
    await this.#requirePermission(
      actor,
      request.organizationId,
      request.projectId,
      'change:request',
      now,
    )
    const changeRequest = await this.#store.findChangeRequest(
      request.organizationId,
      request.projectId,
      request.changeRequestId,
    )
    if (changeRequest === undefined)
      throw this.#error(actor, 'NOT_FOUND', 'The change request was not found.')
    const current = await this.#store.findLatestRequirement(
      changeRequest.organizationId,
      changeRequest.projectId,
      changeRequest.id,
    )
    if (current === undefined)
      throw this.#error(actor, 'NOT_FOUND', 'The requirement was not found.')
    if (current.revision !== request.expectedRevision) {
      throw this.#error(actor, 'CONFLICT', 'The requirement changed before this review was saved.')
    }
    const corrected = requirementSpecV1Schema.parse({
      ...request.correctedRequirement,
      id: this.#idFactory(),
      changeRequestId: changeRequest.id,
      mode: changeRequest.mode,
      attachmentIds: changeRequest.attachments.map((attachment) => attachment.id),
      revision: current.revision + 1,
      createdAt: now.toISOString(),
    })
    await this.#store.saveRequirement(
      changeRequest,
      corrected,
      this.#audit(
        actor,
        request.organizationId,
        request.projectId,
        'requirement.corrected',
        'succeeded',
        now,
        corrected.id,
        `rationale:${request.rationale}`,
      ),
    )
    return corrected
  }

  async #normalizeWithOneRetry(
    actor: ActorContextV1,
    changeRequest: ChangeRequestV1,
  ): Promise<RequirementSpecV1> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await this.#requirementRole.normalize({ actor, changeRequest })
      if (!validControllerEvidence(result.evidence)) {
        throw this.#error(
          actor,
          'VALIDATION_FAILED',
          'Model-backed requirement evidence is incomplete.',
        )
      }
      const parsed = requirementSpecV1Schema.safeParse(result.output)
      if (
        parsed.success &&
        parsed.data.changeRequestId === changeRequest.id &&
        parsed.data.mode === changeRequest.mode &&
        sameIds(
          parsed.data.attachmentIds,
          changeRequest.attachments.map((item) => item.id),
        )
      ) {
        return parsed.data
      }
    }
    throw this.#error(
      actor,
      'VALIDATION_FAILED',
      'Requirement normalization failed schema validation.',
    )
  }

  async #requirePermission(
    actor: ActorContextV1,
    organizationId: string,
    projectId: string,
    permission: ProjectPermissionV1,
    now: Date,
  ): Promise<void> {
    const membership =
      actor.actorType === 'user'
        ? await this.#store.findHumanMembership(organizationId, actor.actorId)
        : undefined
    const serviceGrant =
      actor.actorType === 'service'
        ? await this.#store.findServiceGrant(organizationId, actor.actorId)
        : undefined
    const decision = authorize({
      actor,
      correlationId: actor.correlationId,
      decidedAt: now,
      ...(membership === undefined ? {} : { membership }),
      ...(serviceGrant === undefined ? {} : { serviceGrant }),
      organizationId,
      projectId,
      permission,
    })
    await this.#store.appendAuditEvent(
      this.#audit(
        actor,
        organizationId,
        projectId,
        `authorization.${permission}`,
        decision.allowed ? 'allowed' : 'denied',
        now,
      ),
    )
    if (!decision.allowed)
      throw this.#error(
        actor,
        'AUTHORIZATION_DENIED',
        'You are not authorized to perform this action.',
      )
  }

  #audit(
    actor: ActorContextV1,
    organizationId: string,
    projectId: string,
    action: string,
    outcome: ChangeRequestAuditEvent['outcome'],
    occurredAt: Date,
    targetId = projectId,
    payloadRef?: string,
  ): ChangeRequestAuditEvent {
    return {
      id: this.#idFactory(),
      schemaVersion: '1',
      organizationId,
      projectId,
      actorRef: `${actor.actorType}:${actor.actorId}`,
      action,
      targetRef: `${action.startsWith('requirement.') ? 'requirement' : action.startsWith('change.') ? 'change' : 'project'}:${targetId}`,
      outcome,
      correlationId: actor.correlationId,
      ...(payloadRef === undefined ? {} : { payloadRef }),
      occurredAt,
    }
  }

  #error(
    actor: ActorContextV1,
    code: ConstructorParameters<typeof PlatformError>[0]['code'],
    safeMessage: string,
  ) {
    return new PlatformError({
      code,
      correlationId: actor.correlationId,
      retryable: false,
      safeMessage,
    })
  }
}

function validControllerEvidence(evidence: RequirementNormalizationEvidence): boolean {
  if (evidence.source === 'fixture') return true
  return [
    evidence.estimateId,
    evidence.budgetDecisionId,
    evidence.routingDecisionId,
    evidence.pricingVersion,
    evidence.usageRecordId,
  ].every((value) => typeof value === 'string' && value.length > 0)
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  )
}
