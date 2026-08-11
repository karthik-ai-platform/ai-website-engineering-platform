import type { ActorContextV1, CorrelationId } from '@platform/contracts'

import { PlatformError } from './error.js'

export interface AuthenticationCredential {
  readonly correlationId: CorrelationId
  readonly scheme: 'bearer' | 'development' | 'test'
  readonly value: string
}

export interface AuthenticationPort {
  authenticate(credential: AuthenticationCredential): Promise<ActorContextV1>
}

export class DenyAllAuthentication implements AuthenticationPort {
  authenticate(credential: AuthenticationCredential): Promise<never> {
    return Promise.reject(
      new PlatformError({
        code: 'AUTHENTICATION_REQUIRED',
        correlationId: credential.correlationId,
        retryable: false,
        safeMessage: 'Authentication is required for this operation.',
      }),
    )
  }
}
