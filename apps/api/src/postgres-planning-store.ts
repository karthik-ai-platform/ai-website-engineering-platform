import {
  approvalRecordV1Schema,
  executionPlanV1Schema,
  runV1Schema,
  type ApprovalRecordV1,
  type PlanningResultV1,
  type RunV1,
} from '@platform/contracts'
import {
  approvals,
  auditEvents,
  changeRequests,
  executionPlans,
  policyProfiles,
  projects,
  requirementSpecs,
  runs,
  type PlatformDatabase,
} from '@platform/database'
import type { PlanningAuditEvent, PlanningContext, PlanningStore } from '@platform/domain'
import { and, desc, eq } from 'drizzle-orm'

import { PostgresProjectStore } from './postgres-project-store.js'

export class PostgresPlanningStore implements PlanningStore {
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

  async findPlanningContext(
    organizationId: string,
    projectId: string,
    changeRequestId: string,
    requirementId: string,
  ): Promise<PlanningContext | undefined> {
    const [latest] = await this.database
      .select({ id: requirementSpecs.id })
      .from(requirementSpecs)
      .where(
        and(
          eq(requirementSpecs.organizationId, organizationId),
          eq(requirementSpecs.projectId, projectId),
          eq(requirementSpecs.changeRequestId, changeRequestId),
        ),
      )
      .orderBy(desc(requirementSpecs.revision))
      .limit(1)
    if (latest?.id !== requirementId) return undefined
    const [row] = await this.database
      .select({
        projectStatus: projects.status,
        policyId: policyProfiles.id,
        policyStatus: policyProfiles.status,
        policyUpdatedAt: policyProfiles.updatedAt,
        target: changeRequests.target,
        requirementRevision: requirementSpecs.revision,
        requirementBody: requirementSpecs.body,
      })
      .from(requirementSpecs)
      .innerJoin(
        changeRequests,
        and(
          eq(changeRequests.organizationId, requirementSpecs.organizationId),
          eq(changeRequests.projectId, requirementSpecs.projectId),
          eq(changeRequests.id, requirementSpecs.changeRequestId),
        ),
      )
      .innerJoin(
        projects,
        and(
          eq(projects.organizationId, requirementSpecs.organizationId),
          eq(projects.id, requirementSpecs.projectId),
        ),
      )
      .innerJoin(
        policyProfiles,
        and(
          eq(policyProfiles.organizationId, projects.organizationId),
          eq(policyProfiles.id, projects.policyId),
        ),
      )
      .where(
        and(
          eq(requirementSpecs.organizationId, organizationId),
          eq(requirementSpecs.projectId, projectId),
          eq(requirementSpecs.changeRequestId, changeRequestId),
          eq(requirementSpecs.id, requirementId),
        ),
      )
      .limit(1)
    if (row === undefined) return undefined
    const requirement = executionRequirement(row.requirementBody)
    return {
      projectStatus: row.projectStatus,
      policyId: row.policyId,
      policyStatus: row.policyStatus as PlanningContext['policyStatus'],
      policyVersion: `policy:${row.policyUpdatedAt.toISOString()}`,
      target: row.target as PlanningContext['target'],
      requirementRevision: row.requirementRevision,
      requirementRiskSignals: requirement.riskSignals,
      productionPromotionEnabled: false,
      mediumRiskRequiresApproval: false,
      separationOfDuties: true,
    }
  }

  async findByIdempotencyKey(organizationId: string, projectId: string, idempotencyKey: string) {
    const [row] = await this.database
      .select({ id: executionPlans.id })
      .from(executionPlans)
      .where(
        and(
          eq(executionPlans.organizationId, organizationId),
          eq(executionPlans.projectId, projectId),
          eq(executionPlans.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)
    return row === undefined ? undefined : this.#loadByPlan(organizationId, projectId, row.id)
  }

  async savePlanningResult(
    result: PlanningResultV1,
    idempotencyKey: string,
    events: readonly PlanningAuditEvent[],
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction.insert(executionPlans).values({
        id: result.plan.id,
        organizationId: result.plan.organizationId,
        projectId: result.plan.projectId,
        changeRequestId: result.plan.changeRequestId,
        requirementId: result.plan.requirementId,
        idempotencyKey,
        schemaVersion: result.plan.schemaVersion,
        revision: result.plan.revision,
        baseCommit: result.plan.baseCommit,
        riskClass: result.plan.riskClass,
        body: result.plan,
        policySnapshot: result.plan.policySnapshot,
        createdAt: new Date(result.plan.createdAt),
      })
      await transaction.insert(runs).values(this.#runValues(result.run))
      if (result.approvals.length > 0) {
        await transaction.insert(approvals).values(
          result.approvals.map((approval) => ({
            ...this.#approvalValues(approval),
            idempotencyKey: `${idempotencyKey}:${approval.gate}`.slice(0, 256),
          })),
        )
      }
      if (events.length > 0) await transaction.insert(auditEvents).values(events.map(auditValues))
    })
  }

  async findPlanningResult(
    organizationId: string,
    projectId: string,
    runId: string,
    planId: string,
  ) {
    const result = await this.#loadByPlan(organizationId, projectId, planId)
    return result?.run.id === runId ? result : undefined
  }

  async findCurrentPolicyVersion(organizationId: string, projectId: string) {
    const [row] = await this.database
      .select({ updatedAt: policyProfiles.updatedAt })
      .from(projects)
      .innerJoin(
        policyProfiles,
        and(
          eq(policyProfiles.organizationId, projects.organizationId),
          eq(policyProfiles.id, projects.policyId),
        ),
      )
      .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)))
      .limit(1)
    return row === undefined ? undefined : `policy:${row.updatedAt.toISOString()}`
  }

  async saveApprovalDecision(
    approval: ApprovalRecordV1,
    run: RunV1,
    events: readonly PlanningAuditEvent[],
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const updated = await transaction
        .update(approvals)
        .set({
          decision: approval.decision,
          approverId: approval.approverId ?? null,
          rationale: approval.rationale ?? null,
          decidedAt: approval.decidedAt === undefined ? null : new Date(approval.decidedAt),
        })
        .where(
          and(
            eq(approvals.organizationId, approval.organizationId),
            eq(approvals.projectId, approval.projectId),
            eq(approvals.id, approval.id),
            eq(approvals.decision, 'pending'),
          ),
        )
        .returning({ id: approvals.id })
      if (updated.length !== 1)
        throw new Error('Tenant-scoped approval decision did not update one pending record.')
      await transaction
        .update(runs)
        .set({
          state: run.state,
          endedAt: run.endedAt === undefined ? null : new Date(run.endedAt),
        })
        .where(
          and(
            eq(runs.organizationId, run.organizationId),
            eq(runs.projectId, run.projectId),
            eq(runs.id, run.id),
          ),
        )
      if (events.length > 0) await transaction.insert(auditEvents).values(events.map(auditValues))
    })
  }

  appendAuditEvent(event: PlanningAuditEvent): Promise<void> {
    return this.database
      .insert(auditEvents)
      .values(auditValues(event))
      .then(() => undefined)
  }

  async #loadByPlan(organizationId: string, projectId: string, planId: string) {
    const [planRow] = await this.database
      .select()
      .from(executionPlans)
      .where(
        and(
          eq(executionPlans.organizationId, organizationId),
          eq(executionPlans.projectId, projectId),
          eq(executionPlans.id, planId),
        ),
      )
      .limit(1)
    if (planRow === undefined) return undefined
    const [runRow] = await this.database
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.organizationId, organizationId),
          eq(runs.projectId, projectId),
          eq(runs.executionPlanId, planId),
        ),
      )
      .limit(1)
    if (runRow === undefined) return undefined
    const approvalRows = await this.database
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.organizationId, organizationId),
          eq(approvals.projectId, projectId),
          eq(approvals.runId, runRow.id),
        ),
      )
    return {
      schemaVersion: '1' as const,
      plan: executionPlanV1Schema.parse(planRow.body),
      run: runV1Schema.parse({
        schemaVersion: '1',
        id: runRow.id,
        organizationId: runRow.organizationId,
        projectId: runRow.projectId,
        changeRequestId: runRow.changeRequestId,
        executionPlanId: runRow.executionPlanId,
        baseCommit: runRow.baseCommit,
        state: runRow.state,
        policySnapshot: runRow.policySnapshot,
        createdAt: runRow.createdAt.toISOString(),
        ...(runRow.startedAt === null ? {} : { startedAt: runRow.startedAt.toISOString() }),
        ...(runRow.endedAt === null ? {} : { endedAt: runRow.endedAt.toISOString() }),
      }),
      approvals: approvalRows.map((row) =>
        approvalRecordV1Schema.parse({
          schemaVersion: '1',
          id: row.id,
          organizationId: row.organizationId,
          projectId: row.projectId,
          runId: row.runId,
          planId: row.planId,
          planRevision: row.planRevision,
          gate: row.gate,
          decision: row.decision,
          requesterId: row.requesterId,
          policyVersion: row.policyVersion,
          requestedAt: row.requestedAt.toISOString(),
          ...(row.approverId === null ? {} : { approverId: row.approverId }),
          ...(row.rationale === null ? {} : { rationale: row.rationale }),
          ...(row.decidedAt === null ? {} : { decidedAt: row.decidedAt.toISOString() }),
        }),
      ),
    }
  }

  #runValues(run: RunV1) {
    return {
      id: run.id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      changeRequestId: run.changeRequestId,
      executionPlanId: run.executionPlanId,
      baseCommit: run.baseCommit,
      state: run.state,
      policySnapshot: run.policySnapshot,
      createdAt: new Date(run.createdAt),
      startedAt: run.startedAt === undefined ? null : new Date(run.startedAt),
      endedAt: run.endedAt === undefined ? null : new Date(run.endedAt),
    }
  }

  #approvalValues(approval: ApprovalRecordV1) {
    return {
      id: approval.id,
      organizationId: approval.organizationId,
      projectId: approval.projectId,
      runId: approval.runId,
      planId: approval.planId,
      planRevision: approval.planRevision,
      gate: approval.gate,
      decision: approval.decision,
      requesterId: approval.requesterId,
      approverId: approval.approverId ?? null,
      rationale: approval.rationale ?? null,
      policyVersion: approval.policyVersion,
      requestedAt: new Date(approval.requestedAt),
      decidedAt: approval.decidedAt === undefined ? null : new Date(approval.decidedAt),
    }
  }
}

function auditValues(event: PlanningAuditEvent) {
  return {
    id: event.id,
    schemaVersion: event.schemaVersion,
    organizationId: event.organizationId,
    projectId: event.projectId,
    actorRef: event.actorRef,
    action: event.action,
    targetRef: event.targetRef,
    outcome: event.outcome,
    correlationId: event.correlationId,
    payloadRef: event.payloadRef ?? null,
    occurredAt: event.occurredAt,
  }
}

function executionRequirement(value: unknown): { readonly riskSignals: readonly string[] } {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('riskSignals' in value) ||
    !Array.isArray(value.riskSignals)
  ) {
    throw new Error('Stored requirement risk signals are invalid.')
  }
  return {
    riskSignals: value.riskSignals.filter((item): item is string => typeof item === 'string'),
  }
}
