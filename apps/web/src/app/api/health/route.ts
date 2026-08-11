import { randomUUID } from 'node:crypto'

import { correlationIdSchema, healthResponseV1Schema } from '@platform/contracts'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET(request: NextRequest) {
  const suppliedCorrelationId = request.headers.get('x-correlation-id')
  const parsedCorrelationId = correlationIdSchema.safeParse(suppliedCorrelationId)
  const correlationId = parsedCorrelationId.success ? parsedCorrelationId.data : randomUUID()
  const response = healthResponseV1Schema.parse({
    schemaVersion: '1',
    checks: [],
    correlationId,
    service: 'management-web',
    status: 'ok',
    timestamp: new Date().toISOString(),
  })

  return NextResponse.json(response, {
    headers: { 'x-correlation-id': correlationId },
  })
}
