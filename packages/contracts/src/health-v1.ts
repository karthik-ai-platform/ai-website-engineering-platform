import { z } from 'zod'

import { correlationIdSchema, isoTimestampSchema, schemaVersionV1 } from './common.js'

export const dependencyHealthStatusV1Schema = z.enum([
  'healthy',
  'degraded',
  'unhealthy',
  'disabled',
])

export const dependencyHealthV1Schema = z
  .object({
    checkedAt: isoTimestampSchema,
    detail: z.string().min(1).max(512).optional(),
    name: z.string().min(1).max(120),
    status: dependencyHealthStatusV1Schema,
  })
  .strict()

export const healthResponseV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    checks: z.array(dependencyHealthV1Schema),
    correlationId: correlationIdSchema,
    service: z.string().min(1).max(120),
    status: z.enum(['degraded', 'ok', 'unavailable']),
    timestamp: isoTimestampSchema,
  })
  .strict()

export type DependencyHealthV1 = z.infer<typeof dependencyHealthV1Schema>
export type HealthResponseV1 = z.infer<typeof healthResponseV1Schema>
