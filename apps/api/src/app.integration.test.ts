import {
  actorContextV1Schema,
  apiErrorResponseV1Schema,
  healthResponseV1Schema,
} from '@platform/contracts'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApi, type ReadinessProbe } from './app.js'
import { loadApiConfig } from './config.js'

const actorId = '00000000-0000-4000-8000-000000000002'
const openApps: ReturnType<typeof buildApi>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()))
})

function createTestApp(readinessProbe?: ReadinessProbe) {
  const app = buildApi({
    config: loadApiConfig({ AUTH_MODE: 'test', LOG_LEVEL: 'silent', NODE_ENV: 'test' }),
    ...(readinessProbe === undefined ? {} : { readinessProbe }),
  })
  openApps.push(app)
  return app
}

describe('control-plane API foundation', () => {
  it('returns a versioned liveness response and correlation identifier', async () => {
    const app = createTestApp()
    const response = await app.inject({ method: 'GET', url: '/health/live' })
    const body = healthResponseV1Schema.parse(response.json())

    expect(response.statusCode).toBe(200)
    expect(body).toMatchObject({ service: 'control-plane-api', status: 'ok' })
    expect(response.headers['x-correlation-id']).toBe(body.correlationId)
  })

  it('reports an explicitly disabled local database without claiming connectivity', async () => {
    const app = createTestApp()
    const response = await app.inject({ method: 'GET', url: '/health/ready' })
    const body = healthResponseV1Schema.parse(response.json())

    expect(response.statusCode).toBe(200)
    expect(body.checks).toEqual([expect.objectContaining({ name: 'database', status: 'disabled' })])
  })

  it('returns unavailable when a mandatory dependency probe is unhealthy', async () => {
    const app = createTestApp({
      name: 'database',
      check() {
        return Promise.resolve({
          checkedAt: new Date().toISOString(),
          detail: 'Database readiness check failed.',
          name: 'database',
          status: 'unhealthy',
        })
      },
    })
    const response = await app.inject({ method: 'GET', url: '/health/ready' })
    const body = healthResponseV1Schema.parse(response.json())

    expect(response.statusCode).toBe(503)
    expect(body.status).toBe('unavailable')
  })

  it('rejects an unauthenticated application route with a safe typed error', async () => {
    const app = createTestApp()
    const response = await app.inject({ method: 'GET', url: '/v1/session' })
    const body = apiErrorResponseV1Schema.parse(response.json())

    expect(response.statusCode).toBe(401)
    expect(body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('returns a schema-validated actor for explicit test authentication', async () => {
    const app = createTestApp()
    const response = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { 'x-platform-actor-id': actorId },
    })
    const body = actorContextV1Schema.parse(response.json())

    expect(response.statusCode).toBe(200)
    expect(body).toMatchObject({ actorId, authenticationMethod: 'test' })
  })

  it('rejects local header authentication from non-loopback clients', async () => {
    const app = createTestApp()
    const response = await app.inject({
      method: 'GET',
      remoteAddress: '203.0.113.10',
      url: '/v1/session',
      headers: { 'x-platform-actor-id': actorId },
    })
    const body = apiErrorResponseV1Schema.parse(response.json())

    expect(response.statusCode).toBe(401)
    expect(body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })
})
