import { z } from 'zod'

import { changeTargetV1Schema } from './change-requests-v1.js'
import { isoTimestampSchema, opaqueIdSchema, schemaVersionV1 } from './common.js'

const boundedStatementSchema = z.string().trim().min(1).max(1000)
const gitCommitSchema = z.string().regex(/^[0-9a-f]{40}$/u)
const sha256DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u)

export const riskClassV1Schema = z.enum(['low', 'medium', 'high', 'blocked'])
export const riskSignalCodeV1Schema = z.enum([
  'authentication',
  'authorization',
  'payment',
  'secret',
  'infrastructure',
  'database_migration',
  'destructive_action',
  'production_change',
  'new_dependency',
  'public_api',
  'accessibility',
  'prohibited_request',
])
export const planAnalysisV1Schema = z.enum(['architecture', 'ui_ux', 'security'])
export const approvalGateV1Schema = z.enum([
  'plan_execution',
  'destructive_action',
  'production_promotion',
])
export const approvalDecisionV1Schema = z.enum(['pending', 'approved', 'rejected'])

export const policySnapshotV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    id: opaqueIdSchema,
    organizationId: opaqueIdSchema,
    projectId: opaqueIdSchema,
    policyId: opaqueIdSchema,
    policyVersion: z.string().trim().min(1).max(120),
    target: changeTargetV1Schema,
    productionPromotionEnabled: z.boolean(),
    mediumRiskRequiresApproval: z.boolean(),
    separationOfDuties: z.boolean(),
    capturedAt: isoTimestampSchema,
    digest: sha256DigestSchema,
  })
  .strict()

export const planTaskV1Schema = z
  .object({
    id: z.string().trim().min(1).max(120),
    objective: boundedStatementSchema,
    expectedFiles: z.array(z.string().trim().min(1).max(512)).max(100),
    dependencies: z.array(z.string().trim().min(1).max(120)).max(40),
    validations: z.array(boundedStatementSchema).min(1).max(40),
  })
  .strict()

export const estimatedUsageV1Schema = z
  .object({
    estimateId: opaqueIdSchema,
    budgetDecisionId: opaqueIdSchema,
    source: z.enum(['fixture', 'ai-cost-controller']),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    durationSeconds: z.number().int().nonnegative(),
    costAmount: z.string().regex(/^\d+(?:\.\d{1,8})?$/u),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    pricingVersion: z.string().trim().min(1).max(120),
  })
  .strict()

export const executionPlanV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    id: opaqueIdSchema,
    organizationId: opaqueIdSchema,
    projectId: opaqueIdSchema,
    changeRequestId: opaqueIdSchema,
    requirementId: opaqueIdSchema,
    baseCommit: gitCommitSchema,
    revision: z.number().int().positive(),
    riskClass: riskClassV1Schema,
    riskSignals: z.array(riskSignalCodeV1Schema).max(40),
    expectedImpact: z.array(boundedStatementSchema).min(1).max(60),
    requiredAnalyses: z.array(planAnalysisV1Schema).max(3),
    tasks: z.array(planTaskV1Schema).min(1).max(100),
    requestedApprovals: z.array(approvalGateV1Schema).max(3),
    rollbackConsiderations: z.array(boundedStatementSchema).min(1).max(40),
    estimatedUsage: estimatedUsageV1Schema,
    policySnapshot: policySnapshotV1Schema,
    createdAt: isoTimestampSchema,
  })
  .strict()

export const approvalRecordV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    id: opaqueIdSchema,
    organizationId: opaqueIdSchema,
    projectId: opaqueIdSchema,
    runId: opaqueIdSchema,
    planId: opaqueIdSchema,
    planRevision: z.number().int().positive(),
    gate: approvalGateV1Schema,
    decision: approvalDecisionV1Schema,
    requesterId: opaqueIdSchema,
    approverId: opaqueIdSchema.optional(),
    rationale: z.string().trim().min(1).max(2000).optional(),
    policyVersion: z.string().trim().min(1).max(120),
    requestedAt: isoTimestampSchema,
    decidedAt: isoTimestampSchema.optional(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.decision === 'pending') {
      if (
        record.approverId !== undefined ||
        record.rationale !== undefined ||
        record.decidedAt !== undefined
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Pending approval cannot contain decision attribution.',
        })
      }
      return
    }
    if (
      record.approverId === undefined ||
      record.rationale === undefined ||
      record.decidedAt === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Approval decisions require approver, rationale, and decision time.',
      })
    }
  })

export type ApprovalDecisionV1 = z.infer<typeof approvalDecisionV1Schema>
export type ApprovalGateV1 = z.infer<typeof approvalGateV1Schema>
export type ApprovalRecordV1 = z.infer<typeof approvalRecordV1Schema>
export type EstimatedUsageV1 = z.infer<typeof estimatedUsageV1Schema>
export type ExecutionPlanV1 = z.infer<typeof executionPlanV1Schema>
export type PlanAnalysisV1 = z.infer<typeof planAnalysisV1Schema>
export type PlanTaskV1 = z.infer<typeof planTaskV1Schema>
export type PolicySnapshotV1 = z.infer<typeof policySnapshotV1Schema>
export type RiskClassV1 = z.infer<typeof riskClassV1Schema>
export type RiskSignalCodeV1 = z.infer<typeof riskSignalCodeV1Schema>
