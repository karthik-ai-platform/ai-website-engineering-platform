import {
  approvalDecisionResultV1Schema,
  planningResultV1Schema,
  type ApprovalRecordV1,
  type PlanningResultV1,
  type RunV1,
} from '@platform/contracts'
import {
  PlanningService,
  type HumanMembership,
  type PlannerEvidence,
  type PlannerRolePort,
  type PlanAnalysisRolePort,
  type PlanningAuditEvent,
  type PlanningContext,
  type PlanningStore,
  type ServiceGrant,
} from '@platform/domain'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApi } from './app.js'
import { loadApiConfig } from './config.js'

const requesterId = '00000000-0000-4000-8000-000000000401'
const approverId = '00000000-0000-4000-8000-000000000402'
const organizationId = '00000000-0000-4000-8000-000000000403'
const projectId = '00000000-0000-4000-8000-000000000404'
const changeRequestId = '00000000-0000-4000-8000-000000000405'
const requirementId = '00000000-0000-4000-8000-000000000406'

class MemoryPlanningStore implements PlanningStore {
  context: PlanningContext = {
    projectStatus: 'active',
    policyId: '00000000-0000-4000-8000-000000000407',
    policyStatus: 'active',
    policyVersion: 'policy-v1',
    target: 'preview',
    requirementRevision: 1,
    requirementRiskSignals: ['authentication change'],
    productionPromotionEnabled: false,
    mediumRiskRequiresApproval: false,
    separationOfDuties: true,
  }
  results = new Map<string, PlanningResultV1>()
  keyToPlan = new Map<string, string>()
  audit: PlanningAuditEvent[] = []

  findHumanMembership(
    _organizationId: string,
    actorId: string,
  ): Promise<HumanMembership | undefined> {
    if (actorId === requesterId)
      return Promise.resolve({ actorId, organizationId, role: 'developer', status: 'active' })
    if (actorId === approverId)
      return Promise.resolve({ actorId, organizationId, role: 'reviewer', status: 'active' })
    return Promise.resolve(undefined)
  }
  findServiceGrant(): Promise<ServiceGrant | undefined> {
    return Promise.resolve(undefined)
  }
  findPlanningContext() {
    return Promise.resolve(this.context)
  }
  findByIdempotencyKey(_organizationId: string, _projectId: string, key: string) {
    const planId = this.keyToPlan.get(key)
    return Promise.resolve(planId === undefined ? undefined : this.results.get(planId))
  }
  savePlanningResult(result: PlanningResultV1, key: string, events: readonly PlanningAuditEvent[]) {
    this.results.set(result.plan.id, result)
    this.keyToPlan.set(key, result.plan.id)
    this.audit.push(...events)
    return Promise.resolve()
  }
  findPlanningResult(_organizationId: string, _projectId: string, runId: string, planId: string) {
    const result = this.results.get(planId)
    return Promise.resolve(result?.run.id === runId ? result : undefined)
  }
  findCurrentPolicyVersion() {
    return Promise.resolve(this.context.policyVersion)
  }
  saveApprovalDecision(
    approval: ApprovalRecordV1,
    run: RunV1,
    events: readonly PlanningAuditEvent[],
  ) {
    const result = this.results.get(approval.planId)
    if (result === undefined) throw new Error('Missing fixture result.')
    this.results.set(approval.planId, {
      ...result,
      run,
      approvals: result.approvals.map((item) => (item.id === approval.id ? approval : item)),
    })
    this.audit.push(...events)
    return Promise.resolve()
  }
  appendAuditEvent(event: PlanningAuditEvent) {
    this.audit.push(event)
    return Promise.resolve()
  }
}

const apps: ReturnType<typeof buildApi>[] = []
afterEach(async () => Promise.all(apps.splice(0).map(async (app) => app.close())))

function plannerCandidate() {
  return {
    schemaVersion: '1',
    expectedImpact: ['Authentication behavior changes.'],
    tasks: [
      {
        id: 'auth-contract',
        objective: 'Update authentication contracts.',
        expectedFiles: ['src/auth.ts'],
        dependencies: [],
        validations: ['Run authentication tests.'],
      },
    ],
    rollbackConsiderations: ['Revert the exact result commit.'],
    estimatedUsage: {
      estimateId: '00000000-0000-4000-8000-000000000408',
      budgetDecisionId: '00000000-0000-4000-8000-000000000409',
      source: 'fixture',
      inputTokens: 100,
      outputTokens: 200,
      durationSeconds: 60,
      costAmount: '0.01',
      currency: 'USD',
      pricingVersion: 'fixture-v1',
    },
  }
}

function fixture(
  options: {
    outputs?: unknown[]
    evidence?: PlannerEvidence
    analysisOutputs?: unknown[]
    analysisEvidence?: PlannerEvidence
  } = {},
) {
  const store = new MemoryPlanningStore()
  let roleCalls = 0
  let analysisCalls = 0
  let sequence = 420
  const planner: PlannerRolePort = {
    plan() {
      roleCalls += 1
      return Promise.resolve({
        evidence: options.evidence ?? { source: 'fixture' },
        output:
          options.outputs !== undefined && options.outputs.length > 0
            ? options.outputs.shift()
            : plannerCandidate(),
      })
    },
  }
  const analysisRole: PlanAnalysisRolePort = {
    analyze(input) {
      analysisCalls += 1
      return Promise.resolve({
        evidence: options.analysisEvidence ?? { source: 'fixture' },
        output:
          options.analysisOutputs !== undefined && options.analysisOutputs.length > 0
            ? options.analysisOutputs.shift()
            : {
                schemaVersion: '1',
                analysis: 'security',
                status: 'completed',
                requirementId: input.request.requirementId,
                baseCommit: input.request.baseCommit,
                policySnapshotDigest: input.policySnapshot.digest,
                summary: 'Reviewed authentication security impact.',
                evidenceRefs: ['fixture://security/authentication'],
                threatFindings: ['Authentication changes can weaken identity verification.'],
                requiredControls: ['Retain authorization and tenant isolation checks.'],
              },
      })
    },
  }
  const service = new PlanningService({
    store,
    planner,
    analysisRole,
    clock: () => new Date('2026-08-11T09:30:00.000Z'),
    idFactory: () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
  })
  const api = buildApi({
    config: loadApiConfig({ AUTH_MODE: 'test', LOG_LEVEL: 'silent', NODE_ENV: 'test' }),
    planningService: service,
  })
  apps.push(api)
  return { api, store, roleCalls: () => roleCalls, analysisCalls: () => analysisCalls }
}

function planPayload(idempotencyKey = 'plan-fixture-1') {
  return {
    schemaVersion: '1',
    organizationId,
    projectId,
    changeRequestId,
    requirementId,
    baseCommit: 'a'.repeat(40),
    idempotencyKey,
  }
}

async function createPlan(api: ReturnType<typeof buildApi>, key = 'plan-fixture-1') {
  return planningResultV1Schema.parse(
    (
      await api.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/plans`,
        headers: { 'x-platform-actor-id': requesterId },
        payload: planPayload(key),
      })
    ).json(),
  )
}

function decisionPayload(result: PlanningResultV1, decision: 'approved' | 'rejected') {
  return {
    schemaVersion: '1',
    organizationId,
    projectId,
    runId: result.run.id,
    planId: result.plan.id,
    planRevision: result.plan.revision,
    gate: 'plan_execution',
    expectedPolicyVersion: result.plan.policySnapshot.policyVersion,
    decision,
    rationale: 'Reviewed the risk and validation evidence.',
  }
}

describe('M07 planning and approval API', () => {
  it('creates one idempotent high-risk plan paused before execution', async () => {
    const { api, roleCalls } = fixture()
    const first = await createPlan(api)
    const second = await createPlan(api)
    expect(first.run.state).toBe('AWAITING_APPROVAL')
    expect(first.approvals.map(({ gate }) => gate)).toEqual(['plan_execution'])
    expect(second).toEqual(first)
    expect(roleCalls()).toBe(1)

    const conflict = await api.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/plans`,
      headers: { 'x-platform-actor-id': requesterId },
      payload: { ...planPayload(), baseCommit: 'b'.repeat(40) },
    })
    expect(conflict.statusCode).toBe(409)
    expect(roleCalls()).toBe(1)
  })

  it('reauthorizes a reviewer and advances only after a current approval', async () => {
    const { api, store } = fixture()
    const planned = await createPlan(api)
    const request = {
      method: 'POST' as const,
      url: `/v1/runs/${planned.run.id}/approvals/plan_execution`,
      headers: { 'x-platform-actor-id': approverId },
      payload: decisionPayload(planned, 'approved'),
    }
    const first = approvalDecisionResultV1Schema.parse((await api.inject(request)).json())
    const auditCount = store.audit.filter(({ action }) => action === 'approval.decided').length
    const second = approvalDecisionResultV1Schema.parse((await api.inject(request)).json())
    expect(first.run.state).toBe('QUEUED')
    expect(second).toEqual(first)
    expect(store.audit.filter(({ action }) => action === 'approval.decided')).toHaveLength(
      auditCount,
    )
  })

  it('rejects requester self-approval and stale policy evidence', async () => {
    const { api, store } = fixture()
    const planned = await createPlan(api)
    const self = await api.inject({
      method: 'POST',
      url: `/v1/runs/${planned.run.id}/approvals/plan_execution`,
      headers: { 'x-platform-actor-id': requesterId },
      payload: decisionPayload(planned, 'approved'),
    })
    expect(self.statusCode).toBe(403)

    store.context = { ...store.context, policyVersion: 'policy-v2' }
    const stale = await api.inject({
      method: 'POST',
      url: `/v1/runs/${planned.run.id}/approvals/plan_execution`,
      headers: { 'x-platform-actor-id': approverId },
      payload: decisionPayload(planned, 'approved'),
    })
    expect(stale.statusCode).toBe(409)
    expect(store.audit.some(({ action }) => action === 'approval.stale')).toBe(true)
  })

  it('records rejection as terminal and never relaxes a blocked plan', async () => {
    const { api, store } = fixture()
    const planned = await createPlan(api)
    const rejected = approvalDecisionResultV1Schema.parse(
      (
        await api.inject({
          method: 'POST',
          url: `/v1/runs/${planned.run.id}/approvals/plan_execution`,
          headers: { 'x-platform-actor-id': approverId },
          payload: decisionPayload(planned, 'rejected'),
        })
      ).json(),
    )
    expect(rejected.run.state).toBe('REJECTED')

    store.context = { ...store.context, requirementRiskSignals: ['prohibited credential theft'] }
    const blocked = await createPlan(api, 'blocked-plan-fixture')
    expect(blocked.run.state).toBe('REJECTED')
    expect(blocked.approvals).toEqual([])
    expect(store.audit.some(({ action }) => action === 'policy.blocked')).toBe(true)
  })

  it('rejects mismatched path authority before invoking the planner', async () => {
    const { api, roleCalls } = fixture()
    const response = await api.inject({
      method: 'POST',
      url: '/v1/projects/00000000-0000-4000-8000-000000000499/plans',
      headers: { 'x-platform-actor-id': requesterId },
      payload: planPayload(),
    })
    expect(response.statusCode).toBe(400)
    expect(roleCalls()).toBe(0)
  })

  it('retries malformed planner output once and never retries incomplete controller evidence', async () => {
    const malformed = fixture({
      outputs: [
        {
          ...plannerCandidate(),
          tasks: [{ ...plannerCandidate().tasks[0], dependencies: ['later'] }],
        },
        {
          ...plannerCandidate(),
          tasks: [{ ...plannerCandidate().tasks[0], dependencies: ['later'] }],
        },
      ],
    })
    const malformedResponse = await malformed.api.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/plans`,
      headers: { 'x-platform-actor-id': requesterId },
      payload: planPayload('malformed-plan'),
    })
    expect(malformedResponse.statusCode).toBe(400)
    expect(malformed.roleCalls()).toBe(2)

    const incomplete = fixture({ evidence: { source: 'ai-cost-controller' } })
    const evidenceResponse = await incomplete.api.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/plans`,
      headers: { 'x-platform-actor-id': requesterId },
      payload: planPayload('evidence-plan'),
    })
    expect(evidenceResponse.statusCode).toBe(400)
    expect(incomplete.roleCalls()).toBe(1)
  })

  it('stops before persistence when required analysis evidence is missing, mismatched, or stale', async () => {
    const invalidFixtures = [
      {},
      {
        schemaVersion: '1',
        analysis: 'architecture',
        status: 'completed',
        requirementId,
        baseCommit: 'a'.repeat(40),
        policySnapshotDigest: 'b'.repeat(64),
        summary: 'Wrong analysis kind.',
        evidenceRefs: ['fixture://architecture/wrong'],
        boundaryImpacts: ['Wrong role output.'],
        dependencyImpacts: [],
        dataImpacts: [],
        apiImpacts: [],
      },
      {
        schemaVersion: '1',
        analysis: 'security',
        status: 'completed',
        requirementId,
        baseCommit: 'a'.repeat(40),
        policySnapshotDigest: 'b'.repeat(64),
        summary: 'Stale security analysis.',
        evidenceRefs: ['fixture://security/stale'],
        threatFindings: ['Authentication change risk.'],
        requiredControls: ['Retain tenant isolation.'],
      },
    ]

    for (const [index, output] of invalidFixtures.entries()) {
      const current = fixture({ analysisOutputs: [output, output] })
      const response = await current.api.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/plans`,
        headers: { 'x-platform-actor-id': requesterId },
        payload: planPayload(`invalid-analysis-${index}`),
      })
      expect(response.statusCode).toBe(400)
      expect(current.analysisCalls()).toBe(2)
      expect(current.store.results.size).toBe(0)
    }
  })

  it('does not retry incomplete controller evidence for a required analysis', async () => {
    const current = fixture({ analysisEvidence: { source: 'ai-cost-controller' } })
    const response = await current.api.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/plans`,
      headers: { 'x-platform-actor-id': requesterId },
      payload: planPayload('invalid-analysis-controller-evidence'),
    })
    expect(response.statusCode).toBe(400)
    expect(current.analysisCalls()).toBe(1)
    expect(current.store.results.size).toBe(0)
  })
})
