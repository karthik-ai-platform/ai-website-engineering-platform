import { z } from 'zod'

import { actorContextV1Schema } from './auth-v1.js'
import {
  correlationIdSchema,
  isoTimestampSchema,
  opaqueIdSchema,
  schemaVersionV1,
} from './common.js'

export const runStateV1Schema = z.enum([
  'DRAFT',
  'PLANNING',
  'AWAITING_APPROVAL',
  'QUEUED',
  'PREPARING',
  'IMPLEMENTING',
  'VALIDATING',
  'COMMITTING',
  'DEPLOYING_PREVIEW',
  'VERIFYING_PREVIEW',
  'READY_FOR_REVIEW',
  'PROMOTING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'FAILED',
  'ROLLED_BACK',
])

export const workflowCommandTypeV1Schema = z.enum([
  'START_PLANNING',
  'APPROVE',
  'REJECT',
  'CANCEL',
  'RETRY',
  'ADVANCE',
])

export const workflowCommandV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    actor: actorContextV1Schema,
    commandId: opaqueIdSchema,
    commandType: workflowCommandTypeV1Schema,
    correlationId: correlationIdSchema,
    expectedState: runStateV1Schema,
    idempotencyKey: z.string().min(8).max(200),
    issuedAt: isoTimestampSchema,
    runId: opaqueIdSchema,
    targetState: runStateV1Schema,
  })
  .strict()

const sha256DigestV1Schema = z.string().regex(/^[0-9a-f]{64}$/u)

export const workflowEventPayloadV1Schema = z.record(z.string().min(1).max(120), z.json())

export const workflowEventIntegrityV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    canonicalization: z.literal('RFC8785'),
    digestAlgorithm: z.literal('sha256'),
    payloadDigest: sha256DigestV1Schema,
    previousEventDigest: sha256DigestV1Schema.optional(),
  })
  .strict()

export const workflowEventV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    actorRef: z.string().min(1).max(512),
    correlationId: correlationIdSchema,
    eventId: opaqueIdSchema,
    eventType: z.string().min(1).max(120),
    fromState: runStateV1Schema,
    idempotencyKey: z.string().min(8).max(200),
    integrity: workflowEventIntegrityV1Schema,
    occurredAt: isoTimestampSchema,
    organizationId: opaqueIdSchema,
    payload: workflowEventPayloadV1Schema,
    projectId: opaqueIdSchema,
    runId: opaqueIdSchema,
    toState: runStateV1Schema,
  })
  .strict()

export type RunStateV1 = z.infer<typeof runStateV1Schema>
export type WorkflowCommandV1 = z.infer<typeof workflowCommandV1Schema>
export type WorkflowEventIntegrityV1 = z.infer<typeof workflowEventIntegrityV1Schema>
export type WorkflowEventPayloadV1 = z.infer<typeof workflowEventPayloadV1Schema>
export type WorkflowEventV1 = z.infer<typeof workflowEventV1Schema>
