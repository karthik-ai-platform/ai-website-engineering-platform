import { describe, expect, it } from 'vitest'

import { loadWorkerConfig } from './config.js'

describe('loadWorkerConfig', () => {
  it('loads safe local defaults', () => {
    expect(loadWorkerConfig({})).toEqual({
      host: '127.0.0.1',
      logLevel: 'info',
      nodeEnvironment: 'development',
      port: 4001,
      workerId: 'worker-local',
    })
  })

  it('rejects an invalid health port', () => {
    expect(() => loadWorkerConfig({ WORKER_HEALTH_PORT: '70000' })).toThrow()
  })

  it('rejects worker identifiers that are unsafe for structured metadata', () => {
    expect(() => loadWorkerConfig({ WORKER_ID: 'worker with spaces' })).toThrow()
  })
})
