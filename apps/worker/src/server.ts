import { buildWorkerApp } from './app.js'
import { loadWorkerConfig } from './config.js'
import { WorkerRuntime } from './runtime.js'

const config = loadWorkerConfig()
const runtime = new WorkerRuntime({ workerId: config.workerId })
await runtime.start()

const app = buildWorkerApp({ config, runtime })

const stop = async (signal: NodeJS.Signals) => {
  app.log.info({ signal, workerId: config.workerId }, 'worker stopping')
  await app.close()
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void stop(signal)
  })
}

try {
  await app.listen({ host: config.host, port: config.port })
  app.log.info(
    { host: config.host, port: config.port, workerId: config.workerId },
    'worker health endpoint listening',
  )
} catch (error) {
  app.log.fatal({ err: error, workerId: config.workerId }, 'worker failed to start')
  process.exitCode = 1
}
