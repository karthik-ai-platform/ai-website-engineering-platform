import { createHash, randomUUID } from 'node:crypto'

import {
  plannerCandidateV1Schema,
  type ActorContextV1,
  type ApprovalRecordV1,
  type CreateExecutionPlanRequestV1,
  type DecideApprovalRequestV1,
  type ExecutionPlanV1,
  type PlannerCandidateV1,
  type PlanningResultV1,
  type ProjectPermissionV1,
  type RunV1,
} from '@platform/contracts'

import { authorize, type HumanMembership, type ServiceGrant } from './authorization.js'
import { PlatformError } from './error.js'
import { classifyPlanRisk, decideApproval, executionGateState } from './planning-policy.js'
import { transitionRun } from './run-state.js'

export interface PlannerEvidence {
  readonly source: 'fixture' | 'ai-cost-controller'
  readonly estimateId?: string
  readonly budgetDecisionId?: string
  readonly routingDecisionId?: string
  readonly pricingVersion?: string
  readonly usageRecordId?: string
}

export interface PlannerRolePort {
  plan(input: {
    readonly actor: ActorContextV1
    readonly request: CreateExecutionPlanRequestV1
    readonly requirementRiskSignals: readonly string[]
  }): Promise<{ readonly output: unknown; readonly evidence: PlannerEvidence }>
}

export interface PlanningContext {
  readonly projectStatus: string
  readonly policyId: string
  readonly policyStatus: 'active' | 'retired'
  readonly policyVersion: string
  readonly target: 'preview' | 'staging' | 'production'
  readonly requirementRevision: number
  readonly requirementRiskSignals: readonly string[]
  readonly productionPromotionEnabled: boolean
  readonly mediumRiskRequiresApproval: boolean
  readonly separationOfDuties: boolean
}

export interface PlanningAuditEvent {
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

export interface PlanningStore {
  findHumanMembership(organizationId: string, actorId: string): Promise<HumanMembership | undefined>
  findServiceGrant(organizationId: string, actorId: string): Promise<ServiceGrant | undefined>
  findPlanningContext(
    organizationId: string,
    projectId: string,
    changeRequestId: string,
    requirementId: string,
  ): Promise<PlanningContext | undefined>
  findByIdempotencyKey(
    organizationId: string,
    projectId: string,
    idempotencyKey: string,
  ): Promise<PlanningResultV1 | undefined>
  savePlanningResult(
    result: PlanningResultV1,
    idempotencyKey: string,
    auditEvents: readonly PlanningAuditEvent[],
  ): Promise<void>
  findPlanningResult(
    organizationId: string,
    projectId: string,
    runId: string,
    planId: string,
  ): Promise<PlanningResultV1 | undefined>
  findCurrentPolicyVersion(organizationId: string, projectId: string): Promise<string | undefined>
  saveApprovalDecision(
    approval: ApprovalRecordV1,
    run: RunV1,
    auditEvents: readonly PlanningAuditEvent[],
  ): Promise<void>
  appendAuditEvent(event: PlanningAuditEvent): Promise<void>
}

export class PlanningService {
  readonly #clock: () => Date
  readonly #idFactory: () => string
  readonly #planner: PlannerRolePort
  readonly #store: PlanningStore

  constructor(options: {
    readonly clock?: () => Date
    readonly idFactory?: () => string
    readonly planner: PlannerRolePort
    readonly store: PlanningStore
  }) {
    this.#clock = options.clock ?? (() => new Date())
    this.#idFactory = options.idFactory ?? randomUUID
    this.#planner = options.planner
    this.#store = options.store
  }

  async create(
    actor: ActorContextV1,
    request: CreateExecutionPlanRequestV1,
  ): Promise<PlanningResultV1> {
    const now = this.#clock()
    await this.#requirePermission(
      actor,
      request.organizationId,
      request.projectId,
      'change:request',
      now,
    )
    const existing = await this.#store.findByIdempotencyKey(
      request.organizationId,
      request.projectId,
      request.idempotencyKey,
    )
    if (existing !== undefined) {
      if (!samePlanningRequest(existing.plan, request)) {
        throw this.#error(actor, 'CONFLICT', 'The idempotency key belongs to another plan request.')
      }
      return existing
    }

    const context = await this.#store.findPlanningContext(
      request.organizationId,
      request.projectId,
      request.changeRequestId,
      request.requirementId,
    )
    if (
      context === undefined ||
      context.projectStatus !== 'active' ||
      context.policyStatus !== 'active'
    ) {
      throw this.#error(actor, 'NOT_FOUND', 'The active requirement and policy were not found.')
    }
    const candidate = await this.#planWithOneRetry(actor, request, context.requirementRiskSignals)
    const assessment = classifyPlanRisk({
      target: context.target,
      riskSignals: context.requirementRiskSignals,
      taskObjectives: candidate.tasks.map(({ objective }) => objective),
      expectedFiles: candidate.tasks.flatMap(({ expectedFiles }) => expectedFiles),
    })
    const requestedApprovals = [
      ...assessment.requestedApprovals,
      ...(assessment.riskClass === 'medium' && context.mediumRiskRequiresApproval
        ? (['plan_execution'] as const)
        : []),
    ]
    const policySnapshot = {
      schemaVersion: '1' as const,
      id: this.#idFactory(),
      organizationId: request.organizationId,
      projectId: request.projectId,
      policyId: context.policyId,
      policyVersion: context.policyVersion,
      target: context.target,
      productionPromotionEnabled: context.productionPromotionEnabled,
      mediumRiskRequiresApproval: context.mediumRiskRequiresApproval,
      separationOfDuties: context.separationOfDuties,
      capturedAt: now.toISOString(),
      digest: policyDigest(context, request.organizationId, request.projectId),
    }
    const plan: ExecutionPlanV1 = {
      schemaVersion: '1',
      id: this.#idFactory(),
      organizationId: request.organizationId,
      projectId: request.projectId,
      changeRequestId: request.changeRequestId,
      requirementId: request.requirementId,
      baseCommit: request.baseCommit,
      revision: 1,
      riskClass: assessment.riskClass,
      riskSignals: [...assessment.riskSignals],
      expectedImpact: candidate.expectedImpact,
      requiredAnalyses: [...assessment.requiredAnalyses],
      tasks: candidate.tasks,
      requestedApprovals: [...new Set(requestedApprovals)],
      rollbackConsiderations: candidate.rollbackConsiderations,
      estimatedUsage: candidate.estimatedUsage,
      policySnapshot,
      createdAt: now.toISOString(),
    }
    const runId = this.#idFactory()
    const approvals = plan.requestedApprovals.map<ApprovalRecordV1>((gate) => ({
      schemaVersion: '1',
      id: this.#idFactory(),
      organizationId: plan.organizationId,
      projectId: plan.projectId,
      runId,
      planId: plan.id,
      planRevision: plan.revision,
      gate,
      decision: 'pending',
      requesterId: actor.actorId,
      policyVersion: policySnapshot.policyVersion,
      requestedAt: now.toISOString(),
    }))
    const initialState = executionGateState({ plan, approvals })
    const run: RunV1 = {
      schemaVersion: '1',
      id: runId,
      organizationId: plan.organizationId,
      projectId: plan.projectId,
      changeRequestId: plan.changeRequestId,
      executionPlanId: plan.id,
      baseCommit: plan.baseCommit,
      state: initialState,
      policySnapshot,
      createdAt: now.toISOString(),
      ...(initialState === 'REJECTED' ? { endedAt: now.toISOString() } : {}),
    }
    const result: PlanningResultV1 = { schemaVersion: '1', plan, run, approvals }
    const events = [
      this.#audit(
        actor,
        plan.organizationId,
        plan.projectId,
        'plan.completed',
        'succeeded',
        now,
        `plan:${plan.id}`,
      ),
      ...(initialState === 'REJECTED'
        ? [
            this.#audit(
              actor,
              plan.organizationId,
              plan.projectId,
              'policy.blocked',
              'denied',
              now,
              `run:${run.id}`,
            ),
          ]
        : approvals.map(() =>
            this.#audit(
              actor,
              plan.organizationId,
              plan.projectId,
              'approval.requested',
              'succeeded',
              now,
              `run:${run.id}`,
            ),
          )),
    ]
    await this.#store.savePlanningResult(result, request.idempotencyKey, events)
    return result
  }

  async decide(actor: ActorContextV1, request: DecideApprovalRequestV1) {
    const now = this.#clock()
    await this.#requirePermission(
      actor,
      request.organizationId,
      request.projectId,
      'change:approve',
      now,
    )
    const result = await this.#store.findPlanningResult(
      request.organizationId,
      request.projectId,
      request.runId,
      request.planId,
    )
    if (result === undefined)
      throw this.#error(actor, 'NOT_FOUND', 'The plan approval was not found.')
    const currentPolicyVersion = await this.#store.findCurrentPolicyVersion(
      request.organizationId,
      request.projectId,
    )
    if (
      request.planRevision !== result.plan.revision ||
      request.expectedPolicyVersion !== result.plan.policySnapshot.policyVersion ||
      currentPolicyVersion !== result.plan.policySnapshot.policyVersion
    ) {
      await this.#store.appendAuditEvent(
        this.#audit(
          actor,
          request.organizationId,
          request.projectId,
          'approval.stale',
          'denied',
          now,
          `run:${request.runId}`,
        ),
      )
      throw this.#error(actor, 'CONFLICT', 'The plan or policy changed before this decision.')
    }
    const current = result.approvals.find(({ gate }) => gate === request.gate)
    if (current === undefined)
      throw this.#error(actor, 'NOT_FOUND', 'The approval gate was not found.')
    const decided = decideApproval({
      current,
      approverId: actor.actorId,
      decision: request.decision,
      rationale: request.rationale,
      decidedAt: now.toISOString(),
      authorized: true,
      separationOfDuties: result.plan.policySnapshot.separationOfDuties,
      correlationId: actor.correlationId,
    })
    if (decided === current)
      return { schemaVersion: '1' as const, approval: current, run: result.run }
    const approvals = result.approvals.map((item) => (item.id === current.id ? decided : item))
    const gateState = executionGateState({ plan: result.plan, approvals })
    const run =
      gateState === result.run.state
        ? result.run
        : {
            ...result.run,
            state: transitionRun({
              authority: 'orchestrator',
              correlationId: actor.correlationId,
              from: result.run.state,
              to: gateState,
            }),
            ...(gateState === 'REJECTED' ? { endedAt: now.toISOString() } : {}),
          }
    await this.#store.saveApprovalDecision(decided, run, [
      this.#audit(
        actor,
        request.organizationId,
        request.projectId,
        'approval.decided',
        'succeeded',
        now,
        `approval:${decided.id}`,
        `decision:${decided.decision}`,
      ),
    ])
    return { schemaVersion: '1' as const, approval: decided, run }
  }

  async #planWithOneRetry(
    actor: ActorContextV1,
    request: CreateExecutionPlanRequestV1,
    requirementRiskSignals: readonly string[],
  ): Promise<PlannerCandidateV1> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await this.#planner.plan({ actor, request, requirementRiskSignals })
      if (!validPlannerEvidence(result.evidence)) {
        throw this.#error(
          actor,
          'VALIDATION_FAILED',
          'Model-backed planner evidence is incomplete.',
        )
      }
      const candidate = plannerCandidateV1Schema.safeParse(result.output)
      if (
        candidate.success &&
        orderedTaskGraph(candidate.data) &&
        matchingUsageEvidence(candidate.data, result.evidence)
      ) {
        return candidate.data
      }
    }
    throw this.#error(actor, 'VALIDATION_FAILED', 'The planner output is not a valid ordered plan.')
  }

  async #requirePermission(
    actor: ActorContextV1,
    organizationId: string,
    projectId: string,
    permission: ProjectPermissionV1,
    now: Date,
  ) {
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
        `project:${projectId}`,
        `reason:${decision.reason}`,
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
    outcome: PlanningAuditEvent['outcome'],
    occurredAt: Date,
    targetRef: string,
    payloadRef?: string,
  ): PlanningAuditEvent {
    return {
      id: this.#idFactory(),
      schemaVersion: '1',
      organizationId,
      projectId,
      actorRef: `${actor.actorType}:${actor.actorId}`,
      action,
      targetRef,
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

function orderedTaskGraph(candidate: PlannerCandidateV1): boolean {
  const seen = new Set<string>()
  for (const task of candidate.tasks) {
    if (seen.has(task.id) || task.dependencies.some((dependency) => !seen.has(dependency)))
      return false
    seen.add(task.id)
  }
  return true
}

function validPlannerEvidence(evidence: PlannerEvidence): boolean {
  if (evidence.source === 'fixture') return true
  return [
    evidence.estimateId,
    evidence.budgetDecisionId,
    evidence.routingDecisionId,
    evidence.pricingVersion,
    evidence.usageRecordId,
  ].every((value) => typeof value === 'string' && value.length > 0)
}

function matchingUsageEvidence(candidate: PlannerCandidateV1, evidence: PlannerEvidence): boolean {
  if (candidate.estimatedUsage.source !== evidence.source) return false
  if (evidence.source === 'fixture') return true
  return (
    candidate.estimatedUsage.estimateId === evidence.estimateId &&
    candidate.estimatedUsage.budgetDecisionId === evidence.budgetDecisionId &&
    candidate.estimatedUsage.pricingVersion === evidence.pricingVersion
  )
}

function samePlanningRequest(
  plan: ExecutionPlanV1,
  request: CreateExecutionPlanRequestV1,
): boolean {
  return (
    plan.organizationId === request.organizationId &&
    plan.projectId === request.projectId &&
    plan.changeRequestId === request.changeRequestId &&
    plan.requirementId === request.requirementId &&
    plan.baseCommit === request.baseCommit
  )
}

function policyDigest(context: PlanningContext, organizationId: string, projectId: string): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        organizationId,
        projectId,
        policyId: context.policyId,
        policyVersion: context.policyVersion,
        target: context.target,
        productionPromotionEnabled: context.productionPromotionEnabled,
        mediumRiskRequiresApproval: context.mediumRiskRequiresApproval,
        separationOfDuties: context.separationOfDuties,
      }),
    )
    .digest('hex')
}
