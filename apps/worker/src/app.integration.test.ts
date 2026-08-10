import { healthResponseV1Schema } from '@platform/contracts'
import { afterEach, describe, expect, it } from 'vitest'

import { buildWorkerApp } from './app.js'
import { loadWorkerConfig } from './config.js'
import { WorkerRuntime } from './runtime.js'

const openApps: ReturnType<typeof buildWorkerApp>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()))
})

function createApp(runtime: WorkerRuntime) {
  const app = buildWorkerApp({
    config: loadWorkerConfig({ LOG_LEVEL: 'silent', NODE_ENV: 'test' }),
    runtime,
  })
  openApps.push(app)
  return app
}

describe('worker health boundary', () => {
  it('reports unavailable before the process runtime is ready', async () => {
    const app = createApp(new WorkerRuntime())
    const response = await app.inject({ method: 'GET', url: '/health/ready' })
    const body = healthResponseV1Schema.parse(response.json())

    expect(response.statusCode).toBe(503)
    expect(body.status).toBe('unavailable')
  })

  it('reports ready only after runtime startup', async () => {
    const runtime = new WorkerRuntime()
    await runtime.start()
    const app = createApp(runtime)
    const response = await app.inject({ method: 'GET', url: '/health/ready' })
    const body = healthResponseV1Schema.parse(response.json())

    expect(response.statusCode).toBe(200)
    expect(body.checks).toEqual([
      expect.objectContaining({ name: 'worker-runtime', status: 'healthy' }),
    ])
  })
})
