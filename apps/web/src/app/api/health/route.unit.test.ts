import { healthResponseV1Schema } from '@platform/contracts'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { GET } from './route.js'

describe('web health route', () => {
  it('returns a versioned health response with a stable correlation header', async () => {
    const correlationId = '00000000-0000-4000-8000-000000000001'
    const response = GET(
      new NextRequest('http://localhost:3000/api/health', {
        headers: { 'x-correlation-id': correlationId },
      }),
    )
    const body = healthResponseV1Schema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(response.headers.get('x-correlation-id')).toBe(correlationId)
    expect(body).toMatchObject({
      correlationId,
      service: 'management-web',
      status: 'ok',
    })
  })

  it('generates a schema-valid correlation identifier when the header is invalid', async () => {
    const response = GET(
      new NextRequest('http://localhost:3000/api/health', {
        headers: { 'x-correlation-id': 'not-a-correlation-id' },
      }),
    )
    const body = healthResponseV1Schema.parse(await response.json())

    expect(response.headers.get('x-correlation-id')).toBe(body.correlationId)
    expect(body.status).toBe('ok')
  })
})
