import { correlationIdSchema, healthResponseV1Schema } from '@platform/contracts'
import { createPlatformLogger, resolveCorrelationId } from '@platform/observability'
import Fastify, { LogController } from 'fastify'

import type { WorkerConfig } from './config.js'
import type { WorkerRuntime } from './runtime.js'

export interface BuildWorkerAppOptions {
  readonly config: WorkerConfig
  readonly runtime: WorkerRuntime
}

export function buildWorkerApp(options: BuildWorkerAppOptions) {
  const app = Fastify({
    genReqId: (request) => resolveCorrelationId(singleHeader(request.headers['x-correlation-id'])),
    logController: new LogController({ disableRequestLogging: true }),
    loggerInstance: createPlatformLogger({
      level: options.config.logLevel,
      service: 'workflow-worker',
    }),
  })

  app.addHook('onSend', (request, reply, payload, done) => {
    void reply.header('x-correlation-id', request.id)
    done(null, payload)
  })

  app.get('/health/live', (request) =>
    healthResponseV1Schema.parse({
      schemaVersion: '1',
      checks: [],
      correlationId: correlationIdSchema.parse(request.id),
      service: 'workflow-worker',
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  )

  app.get('/health/ready', async (request, reply) => {
    const ready = options.runtime.ready
    if (!ready) void reply.code(503)

    return healthResponseV1Schema.parse({
      schemaVersion: '1',
      checks: [
        {
          checkedAt: new Date().toISOString(),
          detail: ready ? undefined : 'Worker process has not entered the ready lifecycle state.',
          name: 'worker-runtime',
          status: ready ? 'healthy' : 'unhealthy',
        },
      ],
      correlationId: correlationIdSchema.parse(request.id),
      service: 'workflow-worker',
      status: ready ? 'ok' : 'unavailable',
      timestamp: new Date().toISOString(),
    })
  })

  app.addHook('onClose', async () => {
    await options.runtime.stop()
  })

  return app
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
