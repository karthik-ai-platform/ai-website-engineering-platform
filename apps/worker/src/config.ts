import { z } from 'zod'

const workerConfigSchema = z.object({
  host: z.string().min(1).default('127.0.0.1'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  nodeEnvironment: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().min(1).max(65_535).default(4001),
  workerId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9._-]+$/u)
    .default('worker-local'),
})

export type WorkerConfig = Readonly<z.infer<typeof workerConfigSchema>>

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return Object.freeze(
    workerConfigSchema.parse({
      host: environment['WORKER_HEALTH_HOST'],
      logLevel: environment['LOG_LEVEL'],
      nodeEnvironment: environment['NODE_ENV'],
      port: environment['WORKER_HEALTH_PORT'],
      workerId: environment['WORKER_ID'],
    }),
  )
}
