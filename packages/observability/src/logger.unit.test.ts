import { PassThrough } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { createPlatformLogger, resolveCorrelationId } from './logger.js'

function captureLog(write: (logger: ReturnType<typeof createPlatformLogger>) => void): string {
  const destination = new PassThrough()
  let output = ''
  destination.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })

  const logger = createPlatformLogger({ destination, service: 'test-service' })
  write(logger)
  destination.end()
  return output
}

describe('platform logger', () => {
  it('redacts credential-shaped structured fields', () => {
    const output = captureLog((logger) => {
      logger.info(
        {
          authorization: 'placeholder-authorization',
          config: { databaseUrl: 'placeholder-database-url' },
          credentials: { token: 'placeholder-token' },
        },
        'redaction check',
      )
    })

    expect(output).not.toContain('placeholder-authorization')
    expect(output).not.toContain('placeholder-database-url')
    expect(output).not.toContain('placeholder-token')
    expect(output).toContain('[REDACTED]')
  })

  it('does not serialize unrestricted unexpected error messages', () => {
    const output = captureLog((logger) => {
      logger.error({ err: new Error('placeholder-sensitive-detail') }, 'operation failed')
    })

    expect(output).not.toContain('placeholder-sensitive-detail')
    expect(output).toContain('An unexpected internal error occurred.')
  })

  it('preserves a valid incoming correlation identifier', () => {
    const correlationId = '00000000-0000-4000-8000-000000000001'
    expect(resolveCorrelationId(correlationId)).toBe(correlationId)
  })

  it('replaces an invalid incoming correlation identifier', () => {
    expect(resolveCorrelationId('not-a-correlation-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
  })
})
