import { z } from 'zod'

import { isoTimestampSchema, opaqueIdSchema, schemaVersionV1 } from './common.js'

export const changeModeV1Schema = z.enum([
  'builder',
  'designer',
  'refactor',
  'debug',
  'seo',
  'performance',
  'accessibility',
  'content',
])

export const changeTargetV1Schema = z.enum(['preview', 'staging', 'production'])
export const attachmentKindV1Schema = z.enum(['image', 'document', 'web_reference'])
export const attachmentTrustV1Schema = z.enum(['user_supplied_untrusted', 'external_untrusted'])
export const attachmentScanStatusV1Schema = z.enum(['pending', 'clean', 'rejected'])

export const changeAttachmentV1Schema = z
  .object({
    id: opaqueIdSchema,
    kind: attachmentKindV1Schema,
    displayName: z.string().trim().min(1).max(255),
    mediaType: z.string().trim().min(1).max(160),
    sizeBytes: z.number().int().nonnegative().max(25_000_000),
    digest: z.string().regex(/^[a-f0-9]{64}$/u),
    artifactRef: z.string().trim().min(1).max(1024),
    trust: attachmentTrustV1Schema,
    scanStatus: attachmentScanStatusV1Schema,
  })
  .strict()

export const createChangeRequestV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    organizationId: opaqueIdSchema,
    projectId: opaqueIdSchema,
    originalPrompt: z.string().trim().min(1).max(20_000),
    mode: changeModeV1Schema,
    target: changeTargetV1Schema,
    constraints: z.array(z.string().trim().min(1).max(500)).max(40),
    attachments: z.array(changeAttachmentV1Schema).max(20),
  })
  .strict()

export const changeRequestStatusV1Schema = z.enum([
  'intake_complete',
  'requirements_pending',
  'requirements_review',
  'blocked',
])

export const changeRequestV1Schema = createChangeRequestV1Schema.extend({
  id: opaqueIdSchema,
  actorId: opaqueIdSchema,
  actorType: z.enum(['user', 'service']),
  status: changeRequestStatusV1Schema,
  createdAt: isoTimestampSchema,
})

const boundedStatementSchema = z.string().trim().min(1).max(1000)

export const requirementSpecV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    id: opaqueIdSchema,
    changeRequestId: opaqueIdSchema,
    mode: changeModeV1Schema,
    summary: z.string().trim().min(1).max(2000),
    goals: z.array(boundedStatementSchema).min(1).max(40),
    nonGoals: z.array(boundedStatementSchema).max(40),
    assumptions: z.array(boundedStatementSchema).max(40),
    questions: z.array(boundedStatementSchema).max(40),
    acceptanceCriteria: z.array(boundedStatementSchema).min(1).max(60),
    impactedSurfaces: z.array(boundedStatementSchema).min(1).max(60),
    constraints: z.array(boundedStatementSchema).max(40),
    riskSignals: z.array(boundedStatementSchema).max(40),
    attachmentIds: z.array(opaqueIdSchema).max(20),
    revision: z.number().int().positive(),
    createdAt: isoTimestampSchema,
  })
  .strict()

export const requirementReviewRequestV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    organizationId: opaqueIdSchema,
    projectId: opaqueIdSchema,
    changeRequestId: opaqueIdSchema,
    expectedRevision: z.number().int().positive(),
    correctedRequirement: requirementSpecV1Schema,
    rationale: z.string().trim().min(1).max(2000),
  })
  .strict()

export type ChangeAttachmentV1 = z.infer<typeof changeAttachmentV1Schema>
export type ChangeModeV1 = z.infer<typeof changeModeV1Schema>
export type ChangeRequestV1 = z.infer<typeof changeRequestV1Schema>
export type ChangeRequestStatusV1 = z.infer<typeof changeRequestStatusV1Schema>
export type ChangeTargetV1 = z.infer<typeof changeTargetV1Schema>
export type CreateChangeRequestV1 = z.infer<typeof createChangeRequestV1Schema>
export type RequirementReviewRequestV1 = z.infer<typeof requirementReviewRequestV1Schema>
export type RequirementSpecV1 = z.infer<typeof requirementSpecV1Schema>
