import { describe, expect, it } from 'vitest'

import { approvalRecordV1Schema, executionPlanV1Schema } from './planning-policy-v1.js'

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`

describe('M07 planning and policy contracts', () => {
  it('accepts a versioned high-risk execution plan with a policy snapshot', () => {
    const result = executionPlanV1Schema.safeParse({
      schemaVersion: '1',
      id: id('1'),
      organizationId: id('2'),
      projectId: id('3'),
      changeRequestId: id('4'),
      requirementId: id('5'),
      baseCommit: 'a'.repeat(40),
      revision: 1,
      riskClass: 'high',
      riskSignals: ['database_migration'],
      expectedImpact: ['Changes the tenant data schema.'],
      requiredAnalyses: ['architecture', 'security'],
      tasks: [
        {
          id: 'migration',
          objective: 'Add the forward-only schema migration.',
          expectedFiles: ['packages/database/migrations/0005.sql'],
          dependencies: [],
          validations: ['Apply the migration to an ephemeral PostgreSQL database.'],
        },
      ],
      requestedApprovals: ['plan_execution'],
      rollbackConsiderations: ['Use a compensating forward migration.'],
      estimatedUsage: {
        estimateId: id('6'),
        budgetDecisionId: id('7'),
        source: 'fixture',
        inputTokens: 100,
        outputTokens: 200,
        durationSeconds: 60,
        costAmount: '0.01000000',
        currency: 'USD',
        pricingVersion: 'fixture-v1',
      },
      policySnapshot: {
        schemaVersion: '1',
        id: id('8'),
        organizationId: id('2'),
        projectId: id('3'),
        policyId: id('9'),
        policyVersion: 'policy-v1',
        target: 'preview',
        productionPromotionEnabled: false,
        mediumRiskRequiresApproval: false,
        separationOfDuties: true,
        capturedAt: '2026-08-11T08:30:00.000Z',
        digest: 'b'.repeat(64),
      },
      createdAt: '2026-08-11T08:30:00.000Z',
    })

    expect(result.success).toBe(true)
  })

  it('rejects an approval decision without decision attribution', () => {
    const result = approvalRecordV1Schema.safeParse({
      schemaVersion: '1',
      id: id('1'),
      organizationId: id('2'),
      projectId: id('3'),
      runId: id('4'),
      planId: id('5'),
      planRevision: 1,
      gate: 'plan_execution',
      decision: 'approved',
      requesterId: id('6'),
      policyVersion: 'policy-v1',
      requestedAt: '2026-08-11T08:30:00.000Z',
    })

    expect(result.success).toBe(false)
  })
})
