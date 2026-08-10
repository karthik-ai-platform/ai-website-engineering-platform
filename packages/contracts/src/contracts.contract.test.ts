import { describe, expect, it } from 'vitest'

import {
  actorContextV1Schema,
  healthResponseV1Schema,
  workflowCommandV1Schema,
  workflowEventV1Schema,
} from './index.js'

const correlationId = '00000000-0000-4000-8000-000000000001'
const actorId = '00000000-0000-4000-8000-000000000002'
const sessionId = '00000000-0000-4000-8000-000000000003'

describe('versioned boundary contracts', () => {
  it('accepts a schema-valid health response', () => {
    const response = healthResponseV1Schema.parse({
      schemaVersion: '1',
      checks: [],
      correlationId,
      service: 'control-plane-api',
      status: 'ok',
      timestamp: '2026-07-21T00:00:00.000Z',
    })

    expect(response.status).toBe('ok')
  })

  it('rejects model-style prose as a health state', () => {
    expect(() =>
      healthResponseV1Schema.parse({
        schemaVersion: '1',
        checks: [],
        correlationId,
        service: 'control-plane-api',
        status: 'Everything looks good to me',
        timestamp: '2026-07-21T00:00:00.000Z',
      }),
    ).toThrow()
  })

  it('rejects unknown actor fields at an authentication boundary', () => {
    expect(() =>
      actorContextV1Schema.parse({
        schemaVersion: '1',
        actorId,
        actorType: 'user',
        authenticationMethod: 'test',
        correlationId,
        issuedAt: '2026-07-21T00:00:00.000Z',
        sessionId,
        subject: 'fixture-user',
        elevated: true,
      }),
    ).toThrow()
  })

  it('requires a supported schema version for workflow commands', () => {
    expect(() =>
      workflowCommandV1Schema.parse({
        schemaVersion: '2',
        actor: {
          schemaVersion: '1',
          actorId,
          actorType: 'user',
          authenticationMethod: 'test',
          correlationId,
          issuedAt: '2026-07-21T00:00:00.000Z',
          sessionId,
          subject: 'fixture-user',
        },
        commandId: '00000000-0000-4000-8000-000000000004',
        commandType: 'START_PLANNING',
        correlationId,
        expectedState: 'DRAFT',
        idempotencyKey: 'fixture-idempotency-key',
        issuedAt: '2026-07-21T00:00:00.000Z',
        runId: '00000000-0000-4000-8000-000000000005',
        targetState: 'PLANNING',
      }),
    ).toThrow()
  })

  it('requires tenant, project, payload, and integrity metadata for workflow events', () => {
    const event = workflowEventV1Schema.parse({
      schemaVersion: '1',
      actorRef: `user:${actorId}`,
      correlationId,
      eventId: '00000000-0000-4000-8000-000000000006',
      eventType: 'RUN_STATE_CHANGED',
      fromState: 'DRAFT',
      idempotencyKey: 'fixture-event-idempotency-key',
      integrity: {
        schemaVersion: '1',
        canonicalization: 'RFC8785',
        digestAlgorithm: 'sha256',
        payloadDigest: '0'.repeat(64),
      },
      occurredAt: '2026-07-21T00:00:00.000Z',
      organizationId: '00000000-0000-4000-8000-000000000007',
      payload: { reason: 'fixture' },
      projectId: '00000000-0000-4000-8000-000000000008',
      runId: '00000000-0000-4000-8000-000000000005',
      toState: 'PLANNING',
    })

    expect(event).toMatchObject({
      organizationId: '00000000-0000-4000-8000-000000000007',
      projectId: '00000000-0000-4000-8000-000000000008',
    })
    expect(event.integrity.payloadDigest).toHaveLength(64)
  })

  it('rejects workflow events without scoped integrity metadata', () => {
    expect(() =>
      workflowEventV1Schema.parse({
        schemaVersion: '1',
        actorRef: `user:${actorId}`,
        correlationId,
        eventId: '00000000-0000-4000-8000-000000000006',
        eventType: 'RUN_STATE_CHANGED',
        fromState: 'DRAFT',
        idempotencyKey: 'fixture-event-idempotency-key',
        occurredAt: '2026-07-21T00:00:00.000Z',
        payload: { reason: 'fixture' },
        runId: '00000000-0000-4000-8000-000000000005',
        toState: 'PLANNING',
      }),
    ).toThrow()
  })
})
