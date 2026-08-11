import { buildApi } from './app.js'
import { loadApiConfig } from './config.js'

const config = loadApiConfig()
const app = buildApi({ config })

const stop = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, 'control plane stopping')
  await app.close()
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void stop(signal)
  })
}

try {
  await app.listen({ host: config.host, port: config.port })
  app.log.info({ host: config.host, port: config.port }, 'control plane listening')
} catch (error) {
  app.log.fatal({ err: error }, 'control plane failed to start')
  process.exitCode = 1
}
