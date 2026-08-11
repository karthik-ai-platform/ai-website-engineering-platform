import type { ApprovalRecordV1, ExecutionPlanV1 } from '@platform/contracts'
import { describe, expect, it, vi } from 'vitest'

import { PlatformError } from './error.js'
import {
  classifyPlanRisk,
  decideApproval,
  executionGateState,
  orchestrateExecutionGate,
} from './planning-policy.js'

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`
const correlationId = id('99')

const policySnapshot: ExecutionPlanV1['policySnapshot'] = {
  schemaVersion: '1',
  id: id('10'),
  organizationId: id('1'),
  projectId: id('2'),
  policyId: id('11'),
  policyVersion: 'policy-v1',
  target: 'preview',
  productionPromotionEnabled: false,
  mediumRiskRequiresApproval: false,
  separationOfDuties: true,
  capturedAt: '2026-08-11T08:30:00.000Z',
  digest: 'a'.repeat(64),
}

function plan(riskClass: ExecutionPlanV1['riskClass']): ExecutionPlanV1 {
  return {
    schemaVersion: '1',
    id: id('3'),
    organizationId: id('1'),
    projectId: id('2'),
    changeRequestId: id('4'),
    requirementId: id('5'),
    baseCommit: 'b'.repeat(40),
    revision: 1,
    riskClass,
    riskSignals: riskClass === 'high' ? ['database_migration'] : [],
    expectedImpact: ['Fixture impact.'],
    requiredAnalyses: riskClass === 'high' ? ['architecture'] : [],
    tasks: [
      {
        id: 'task-1',
        objective: 'Apply the fixture change.',
        expectedFiles: ['src/fixture.ts'],
        dependencies: [],
        validations: ['Run fixture tests.'],
      },
    ],
    requestedApprovals: riskClass === 'high' ? ['plan_execution'] : [],
    rollbackConsiderations: ['Revert the fixture commit.'],
    estimatedUsage: {
      estimateId: id('6'),
      budgetDecisionId: id('7'),
      source: 'fixture',
      inputTokens: 10,
      outputTokens: 20,
      durationSeconds: 30,
      costAmount: '0.01',
      currency: 'USD',
      pricingVersion: 'fixture-v1',
    },
    policySnapshot,
    createdAt: '2026-08-11T08:30:00.000Z',
  }
}

function pendingApproval(): ApprovalRecordV1 {
  return {
    schemaVersion: '1',
    id: id('8'),
    organizationId: id('1'),
    projectId: id('2'),
    runId: id('9'),
    planId: id('3'),
    planRevision: 1,
    gate: 'plan_execution',
    decision: 'pending',
    requesterId: id('12'),
    policyVersion: 'policy-v1',
    requestedAt: '2026-08-11T08:30:00.000Z',
  }
}

describe('M07 deterministic planning policy', () => {
  it.each([
    ['authentication change', 'high', 'authentication'],
    ['payment checkout', 'high', 'payment'],
    ['secret rotation', 'high', 'secret'],
    ['infrastructure DNS update', 'high', 'infrastructure'],
    ['database migration', 'high', 'database_migration'],
    ['destructive delete all data', 'high', 'destructive_action'],
    ['prohibited credential theft', 'blocked', 'prohibited_request'],
  ] as const)('classifies %s deterministically', (signal, riskClass, code) => {
    const result = classifyPlanRisk({
      target: 'preview',
      riskSignals: [signal],
      taskObjectives: [],
      expectedFiles: [],
    })

    expect(result.riskClass).toBe(riskClass)
    expect(result.riskSignals).toContain(code)
  })

  it('requires relevant architecture, UI, and security analyses', () => {
    const result = classifyPlanRisk({
      target: 'preview',
      riskSignals: ['database migration', 'authentication', 'accessibility'],
      taskObjectives: [],
      expectedFiles: [],
    })

    expect(result.requiredAnalyses).toEqual(['architecture', 'security', 'ui_ux'])
  })

  it('pauses high-risk work before any workspace mutation', async () => {
    const mutateWorkspace = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    await expect(
      orchestrateExecutionGate({
        authority: 'orchestrator',
        plan: plan('high'),
        mutateWorkspace,
      }),
    ).resolves.toBe('AWAITING_APPROVAL')
    expect(mutateWorkspace).not.toHaveBeenCalled()
  })

  it('keeps stale approval evidence waiting', () => {
    expect(
      executionGateState({
        plan: plan('high'),
        approvals: [{ ...pendingApproval(), planRevision: 2, decision: 'approved' }],
      }),
    ).toBe('AWAITING_APPROVAL')
  })

  it('enforces authorization, separation of duties, and idempotent duplicate decisions', () => {
    const current = pendingApproval()
    expect(() =>
      decideApproval({
        current,
        approverId: id('13'),
        decision: 'approved',
        rationale: 'Reviewed evidence.',
        decidedAt: '2026-08-11T08:31:00.000Z',
        authorized: false,
        separationOfDuties: true,
        correlationId,
      }),
    ).toThrow(PlatformError)
    expect(() =>
      decideApproval({
        current,
        approverId: current.requesterId,
        decision: 'approved',
        rationale: 'Self approval.',
        decidedAt: '2026-08-11T08:31:00.000Z',
        authorized: true,
        separationOfDuties: true,
        correlationId,
      }),
    ).toThrow(PlatformError)

    const decided = decideApproval({
      current,
      approverId: id('13'),
      decision: 'approved',
      rationale: 'Reviewed evidence.',
      decidedAt: '2026-08-11T08:31:00.000Z',
      authorized: true,
      separationOfDuties: true,
      correlationId,
    })
    expect(
      decideApproval({
        current: decided,
        approverId: id('13'),
        decision: 'approved',
        rationale: 'Reviewed evidence.',
        decidedAt: '2026-08-11T08:32:00.000Z',
        authorized: true,
        separationOfDuties: true,
        correlationId,
      }),
    ).toBe(decided)
  })

  it('never relaxes a blocked policy result', async () => {
    const mutateWorkspace = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    await expect(
      orchestrateExecutionGate({
        authority: 'orchestrator',
        plan: plan('blocked'),
        approvals: [{ ...pendingApproval(), decision: 'approved' }],
        mutateWorkspace,
      }),
    ).resolves.toBe('REJECTED')
    expect(mutateWorkspace).not.toHaveBeenCalled()
  })

  it('requires every requested approval gate to be current and approved', () => {
    const multiGatePlan: ExecutionPlanV1 = {
      ...plan('high'),
      requestedApprovals: ['plan_execution', 'destructive_action'],
    }
    const approvedPlanGate = { ...pendingApproval(), decision: 'approved' as const }
    expect(executionGateState({ plan: multiGatePlan, approvals: [approvedPlanGate] })).toBe(
      'AWAITING_APPROVAL',
    )
    expect(
      executionGateState({
        plan: multiGatePlan,
        approvals: [
          approvedPlanGate,
          { ...approvedPlanGate, id: id('14'), gate: 'destructive_action' },
        ],
      }),
    ).toBe('QUEUED')
  })
})
