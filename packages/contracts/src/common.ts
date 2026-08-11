import { z } from 'zod'

export const schemaVersionV1 = z.literal('1')
export const opaqueIdSchema = z.uuid()
export const correlationIdSchema = z.uuid()
export const isoTimestampSchema = z.iso.datetime({ offset: true })

export type OpaqueId = z.infer<typeof opaqueIdSchema>
export type CorrelationId = z.infer<typeof correlationIdSchema>
