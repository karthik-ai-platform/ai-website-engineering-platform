import {
  actorContextV1Schema,
  apiErrorResponseV1Schema,
  correlationIdSchema,
  healthResponseV1Schema,
  type DependencyHealthV1,
} from '@platform/contracts'
import { createLazyPostgresConnection } from '@platform/database'
import {
  PlatformError,
  isPlatformError,
  type AuthenticationCredential,
  type AuthenticationPort,
} from '@platform/domain'
import { createPlatformLogger, resolveCorrelationId } from '@platform/observability'
import Fastify, { LogController } from 'fastify'
import { z } from 'zod'

import { LocalAuthenticationAdapter, OidcAuthenticationAdapter } from './authentication.js'
import type { ApiConfig } from './config.js'

const bearerHeaderSchema = z.string().regex(/^Bearer\s+\S+$/iu)

export interface ReadinessProbe {
  readonly name: string
  check(): Promise<DependencyHealthV1>
  close?(): Promise<void>
}

export interface BuildApiOptions {
  readonly authentication?: AuthenticationPort
  readonly config: ApiConfig
  readonly readinessProbe?: ReadinessProbe
}

export function buildApi(options: BuildApiOptions) {
  const logger = createPlatformLogger({
    level: options.config.logLevel,
    service: 'control-plane-api',
  })
  const authentication = options.authentication ?? createAuthentication(options.config)
  const readinessProbe = options.readinessProbe ?? createDatabaseReadinessProbe(options.config)
  const app = Fastify({
    genReqId: (request) => resolveCorrelationId(singleHeader(request.headers['x-correlation-id'])),
    logController: new LogController({ disableRequestLogging: true }),
    loggerInstance: logger,
  })

  app.addHook('onSend', (request, reply, payload, done) => {
    void reply.header('x-correlation-id', request.id)
    done(null, payload)
  })

  app.get('/health/live', (request) =>
    healthResponseV1Schema.parse({
      schemaVersion: '1',
      checks: [],
      correlationId: request.id,
      service: 'control-plane-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  )

  app.get('/health/ready', async (request, reply) => {
    const check = await readinessProbe.check()
    const status = check.status === 'unhealthy' ? 'unavailable' : 'ok'
    if (status === 'unavailable') void reply.code(503)

    return healthResponseV1Schema.parse({
      schemaVersion: '1',
      checks: [check],
      correlationId: request.id,
      service: 'control-plane-api',
      status,
      timestamp: new Date().toISOString(),
    })
  })

  app.get('/v1/session', async (request) => {
    const credential = extractAuthenticationCredential(
      request.headers,
      request.id,
      request.ip,
      options.config,
    )
    const actor = await authentication.authenticate(credential)
    return actorContextV1Schema.parse(actor)
  })

  app.setErrorHandler(async (error, request, reply) => {
    const correlationId = correlationIdSchema.parse(request.id)
    const platformError = isPlatformError(error)
      ? error
      : new PlatformError({
          cause: error,
          code: 'INTERNAL_ERROR',
          correlationId,
          retryable: false,
          safeMessage: 'The request could not be completed safely.',
        })

    if (!isPlatformError(error)) {
      request.log.error({ err: error, correlationId }, 'unhandled request error')
    }

    const statusCode = errorStatusCode(platformError)
    void reply.code(statusCode)
    return apiErrorResponseV1Schema.parse({
      schemaVersion: '1',
      error: {
        code: platformError.code,
        correlationId,
        message: platformError.safeMessage,
        retryable: platformError.retryable,
      },
    })
  })

  app.addHook('onClose', async () => {
    await readinessProbe.close?.()
  })

  return app
}

function createAuthentication(config: ApiConfig): AuthenticationPort {
  if (config.authMode === 'development' || config.authMode === 'test') {
    return new LocalAuthenticationAdapter(config.authMode)
  }

  if (
    config.authAudience === undefined ||
    config.authIssuer === undefined ||
    config.authJwksUri === undefined
  ) {
    throw new Error('Validated OIDC configuration is incomplete.')
  }

  return new OidcAuthenticationAdapter({
    audience: config.authAudience,
    issuer: config.authIssuer,
    jwksUri: config.authJwksUri,
  })
}

function extractAuthenticationCredential(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  correlationId: string,
  requestIp: string,
  config: ApiConfig,
): AuthenticationCredential {
  const parsedCorrelationId = correlationIdSchema.parse(correlationId)

  if (config.authMode === 'oidc') {
    const authorization = bearerHeaderSchema.safeParse(singleHeader(headers['authorization']))
    if (!authorization.success) throw authenticationRequired(parsedCorrelationId)

    return {
      correlationId: parsedCorrelationId,
      scheme: 'bearer',
      value: authorization.data.replace(/^Bearer\s+/iu, ''),
    }
  }

  if (!config.allowUnsafeLocalAuthRemote && !isLoopbackAddress(requestIp)) {
    throw authenticationRequired(parsedCorrelationId)
  }

  const actorId = singleHeader(headers['x-platform-actor-id'])
  if (actorId === undefined) throw authenticationRequired(parsedCorrelationId)

  return {
    correlationId: parsedCorrelationId,
    scheme: config.authMode,
    value: actorId,
  }
}

function createDatabaseReadinessProbe(config: ApiConfig): ReadinessProbe {
  if (config.databaseUrl === undefined) {
    return {
      name: 'database',
      check() {
        return Promise.resolve({
          checkedAt: new Date().toISOString(),
          detail: 'Explicitly disabled for this environment.',
          name: 'database',
          status: 'disabled',
        })
      },
    }
  }

  const connection = createLazyPostgresConnection({ databaseUrl: config.databaseUrl })

  return {
    name: 'database',
    async check() {
      try {
        await connection.client`SELECT 1 AS ready`
        return {
          checkedAt: new Date().toISOString(),
          name: 'database',
          status: 'healthy',
        }
      } catch {
        return {
          checkedAt: new Date().toISOString(),
          detail: 'Database readiness check failed.',
          name: 'database',
          status: 'unhealthy',
        }
      }
    },
    async close() {
      await connection.close()
    },
  }
}

function authenticationRequired(correlationId: string): PlatformError {
  return new PlatformError({
    code: 'AUTHENTICATION_REQUIRED',
    correlationId: correlationIdSchema.parse(correlationId),
    retryable: false,
    safeMessage: 'Authentication is required for this operation.',
  })
}

function errorStatusCode(error: PlatformError): number {
  const statusByCode = {
    AUTHENTICATION_REQUIRED: 401,
    AUTHORIZATION_DENIED: 403,
    CONFIGURATION_INVALID: 500,
    CONFLICT: 409,
    DEPENDENCY_UNAVAILABLE: 503,
    INTERNAL_ERROR: 500,
    INVALID_TRANSITION: 409,
    NOT_FOUND: 404,
    VALIDATION_FAILED: 400,
  } as const

  return statusByCode[error.code]
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function isLoopbackAddress(value: string): boolean {
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1'
}
