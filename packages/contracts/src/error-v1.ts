import { z } from 'zod'

import { correlationIdSchema, schemaVersionV1 } from './common.js'

export const platformErrorCodeV1Schema = z.enum([
  'AUTHENTICATION_REQUIRED',
  'AUTHORIZATION_DENIED',
  'CONFIGURATION_INVALID',
  'CONFLICT',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
  'INVALID_TRANSITION',
  'NOT_FOUND',
  'VALIDATION_FAILED',
])

export const apiErrorResponseV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    error: z
      .object({
        code: platformErrorCodeV1Schema,
        correlationId: correlationIdSchema,
        message: z.string().min(1).max(1_000),
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict()

export type PlatformErrorCodeV1 = z.infer<typeof platformErrorCodeV1Schema>
export type ApiErrorResponseV1 = z.infer<typeof apiErrorResponseV1Schema>
