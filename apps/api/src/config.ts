import { z } from 'zod'

const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol), {
    message: 'DATABASE_URL must use the postgres or postgresql protocol',
  })

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
)

const optionalDatabaseUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  databaseUrlSchema.optional(),
)

const booleanEnvironmentValue = z.enum(['true', 'false']).transform((value) => value === 'true')

const apiConfigSchema = z
  .object({
    allowUnsafeLocalAuthRemote: booleanEnvironmentValue.default(false),
    authAudience: z.string().min(1).optional(),
    authIssuer: optionalUrl,
    authJwksUri: optionalUrl,
    authMode: z.enum(['development', 'test', 'oidc']).default('development'),
    databaseRequired: booleanEnvironmentValue.default(false),
    databaseUrl: optionalDatabaseUrl,
    host: z.string().min(1).default('127.0.0.1'),
    logLevel: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    nodeEnvironment: z.enum(['development', 'test', 'production']).default('development'),
    port: z.coerce.number().int().min(1).max(65_535).default(4000),
  })
  .superRefine((config, context) => {
    if (config.nodeEnvironment === 'production' && config.authMode !== 'oidc') {
      context.addIssue({
        code: 'custom',
        message: 'Production requires AUTH_MODE=oidc',
        path: ['authMode'],
      })
    }

    if (config.nodeEnvironment === 'production' && config.databaseUrl === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'DATABASE_URL is required in production',
        path: ['databaseUrl'],
      })
    }

    if (config.authMode === 'oidc') {
      for (const key of ['authAudience', 'authIssuer', 'authJwksUri'] as const) {
        if (config[key] === undefined) {
          context.addIssue({
            code: 'custom',
            message: `${key} is required when AUTH_MODE=oidc`,
            path: [key],
          })
        }
      }

      if (config.nodeEnvironment === 'production') {
        for (const key of ['authIssuer', 'authJwksUri'] as const) {
          const url = config[key]
          if (url !== undefined && new URL(url).protocol !== 'https:') {
            context.addIssue({
              code: 'custom',
              message: `${key} must use HTTPS in production`,
              path: [key],
            })
          }
        }
      }
    }

    if (config.databaseRequired && config.databaseUrl === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'DATABASE_URL is required when DATABASE_REQUIRED=true',
        path: ['databaseUrl'],
      })
    }
  })

export type ApiConfig = Readonly<z.infer<typeof apiConfigSchema>>

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return Object.freeze(
    apiConfigSchema.parse({
      allowUnsafeLocalAuthRemote: environment['ALLOW_UNSAFE_LOCAL_AUTH_REMOTE'],
      authAudience: environment['AUTH_AUDIENCE'],
      authIssuer: environment['AUTH_ISSUER'],
      authJwksUri: environment['AUTH_JWKS_URI'],
      authMode: environment['AUTH_MODE'],
      databaseRequired: environment['DATABASE_REQUIRED'],
      databaseUrl: environment['DATABASE_URL'],
      host: environment['API_HOST'],
      logLevel: environment['LOG_LEVEL'],
      nodeEnvironment: environment['NODE_ENV'],
      port: environment['API_PORT'],
    }),
  )
}
