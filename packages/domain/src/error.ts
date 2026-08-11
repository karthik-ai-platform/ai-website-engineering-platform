import type { CorrelationId, PlatformErrorCodeV1 } from '@platform/contracts'

export interface PlatformErrorOptions {
  readonly cause?: unknown
  readonly code: PlatformErrorCodeV1
  readonly correlationId: CorrelationId
  readonly retryable: boolean
  readonly safeMessage: string
}

export class PlatformError extends Error {
  readonly code: PlatformErrorCodeV1
  readonly correlationId: CorrelationId
  readonly retryable: boolean
  readonly safeMessage: string

  constructor(options: PlatformErrorOptions) {
    super(options.safeMessage, { cause: options.cause })
    this.name = 'PlatformError'
    this.code = options.code
    this.correlationId = options.correlationId
    this.retryable = options.retryable
    this.safeMessage = options.safeMessage
  }
}

export function isPlatformError(value: unknown): value is PlatformError {
  return value instanceof PlatformError
}
