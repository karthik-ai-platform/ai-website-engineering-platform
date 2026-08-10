import { z } from 'zod'

import {
  correlationIdSchema,
  isoTimestampSchema,
  opaqueIdSchema,
  schemaVersionV1,
} from './common.js'

export const actorTypeV1Schema = z.enum(['user', 'service'])
export const authenticationMethodV1Schema = z.enum(['oidc', 'development', 'test'])

export const actorContextV1Schema = z
  .object({
    schemaVersion: schemaVersionV1,
    actorId: opaqueIdSchema,
    actorType: actorTypeV1Schema,
    authenticationMethod: authenticationMethodV1Schema,
    correlationId: correlationIdSchema,
    expiresAt: isoTimestampSchema.optional(),
    issuedAt: isoTimestampSchema,
    organizationId: opaqueIdSchema.optional(),
    sessionId: opaqueIdSchema,
    subject: z.string().min(1).max(512),
  })
  .strict()

export type ActorTypeV1 = z.infer<typeof actorTypeV1Schema>
export type AuthenticationMethodV1 = z.infer<typeof authenticationMethodV1Schema>
export type ActorContextV1 = z.infer<typeof actorContextV1Schema>
