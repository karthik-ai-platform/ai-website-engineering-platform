import { randomUUID } from 'node:crypto'

import {
  actorContextV1Schema,
  correlationIdSchema,
  opaqueIdSchema,
  type ActorContextV1,
} from '@platform/contracts'
import {
  PlatformError,
  type AuthenticationCredential,
  type AuthenticationPort,
} from '@platform/domain'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose'
import { z } from 'zod'

const oidcClaimsSchema = z
  .object({
    actor_id: opaqueIdSchema,
    exp: z.number().int().positive(),
    iat: z.number().int().positive(),
    organization_id: opaqueIdSchema.optional(),
    sid: opaqueIdSchema.optional(),
    sub: z.string().min(1).max(512),
  })
  .passthrough()

export interface OidcAuthenticationOptions {
  readonly algorithms?: readonly ('ES256' | 'RS256')[]
  readonly audience: string
  readonly issuer: string
  readonly jwksUri: string
  readonly keyResolver?: JWTVerifyGetKey
}

export class OidcAuthenticationAdapter implements AuthenticationPort {
  readonly #algorithms: readonly ('ES256' | 'RS256')[]
  readonly #audience: string
  readonly #issuer: string
  readonly #keyResolver: JWTVerifyGetKey

  constructor(options: OidcAuthenticationOptions) {
    this.#algorithms = options.algorithms ?? ['RS256', 'ES256']
    this.#audience = options.audience
    this.#issuer = options.issuer
    this.#keyResolver = options.keyResolver ?? createRemoteJWKSet(new URL(options.jwksUri))
  }

  async authenticate(credential: AuthenticationCredential): Promise<ActorContextV1> {
    if (credential.scheme !== 'bearer') {
      throw authenticationRequired(credential.correlationId)
    }

    try {
      const verified = await jwtVerify(credential.value, this.#keyResolver, {
        algorithms: [...this.#algorithms],
        audience: this.#audience,
        issuer: this.#issuer,
      })

      return mapVerifiedClaims(verified.payload, credential.correlationId)
    } catch (cause) {
      throw new PlatformError({
        cause,
        code: 'AUTHENTICATION_REQUIRED',
        correlationId: credential.correlationId,
        retryable: false,
        safeMessage: 'The supplied authentication credential is invalid or expired.',
      })
    }
  }
}

export class LocalAuthenticationAdapter implements AuthenticationPort {
  readonly #method: 'development' | 'test'

  constructor(method: 'development' | 'test') {
    this.#method = method
  }

  authenticate(credential: AuthenticationCredential): Promise<ActorContextV1> {
    if (credential.scheme !== this.#method) {
      return Promise.reject(authenticationRequired(credential.correlationId))
    }

    const actorId = opaqueIdSchema.safeParse(credential.value)
    if (!actorId.success) return Promise.reject(authenticationRequired(credential.correlationId))

    return Promise.resolve(
      actorContextV1Schema.parse({
        schemaVersion: '1',
        actorId: actorId.data,
        actorType: 'user',
        authenticationMethod: this.#method,
        correlationId: credential.correlationId,
        issuedAt: new Date().toISOString(),
        sessionId: randomUUID(),
        subject: `${this.#method}:${actorId.data}`,
      }),
    )
  }
}

function mapVerifiedClaims(payload: JWTPayload, correlationId: string): ActorContextV1 {
  const claims = oidcClaimsSchema.parse(payload)

  return actorContextV1Schema.parse({
    schemaVersion: '1',
    actorId: claims.actor_id,
    actorType: 'user',
    authenticationMethod: 'oidc',
    correlationId: correlationIdSchema.parse(correlationId),
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    issuedAt: new Date(claims.iat * 1000).toISOString(),
    organizationId: claims.organization_id,
    sessionId: claims.sid ?? randomUUID(),
    subject: claims.sub,
  })
}

function authenticationRequired(correlationId: string): PlatformError {
  return new PlatformError({
    code: 'AUTHENTICATION_REQUIRED',
    correlationId: correlationIdSchema.parse(correlationId),
    retryable: false,
    safeMessage: 'Authentication is required for this operation.',
  })
}
