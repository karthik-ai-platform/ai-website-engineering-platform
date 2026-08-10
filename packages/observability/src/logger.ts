import { randomUUID } from 'node:crypto'
import type { Writable } from 'node:stream'

import { correlationIdSchema, type CorrelationId } from '@platform/contracts'
import pino, { type Logger, type LoggerOptions } from 'pino'

export const redactedLogPaths = [
  'apiKey',
  'authorization',
  'cookie',
  'databaseUrl',
  'password',
  'privateKey',
  'secret',
  'token',
  'config.databaseUrl',
  'credentials.*',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.apiKey',
  '*.password',
  '*.privateKey',
  '*.secret',
  '*.token',
] as const

export interface PlatformLoggerOptions {
  readonly destination?: Writable
  readonly level?: LoggerOptions['level']
  readonly service: string
}

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { type: 'UnknownError' }

  const safeMessage =
    'safeMessage' in error && typeof error.safeMessage === 'string'
      ? error.safeMessage
      : 'An unexpected internal error occurred.'

  return { message: safeMessage, type: error.name }
}

export function createPlatformLogger(options: PlatformLoggerOptions): Logger {
  const loggerOptions: LoggerOptions = {
    base: { service: options.service },
    level: options.level ?? 'info',
    redact: { censor: '[REDACTED]', paths: [...redactedLogPaths] },
    serializers: { err: serializeError },
  }

  return options.destination === undefined
    ? pino(loggerOptions)
    : pino(loggerOptions, options.destination)
}

export function resolveCorrelationId(candidate?: string): CorrelationId {
  const parsed = correlationIdSchema.safeParse(candidate)
  return parsed.success ? parsed.data : randomUUID()
}
