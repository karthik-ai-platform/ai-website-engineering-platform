import type { CorrelationId, RunStateV1 } from '@platform/contracts'

import { PlatformError } from './error.js'

const terminalStates = new Set<RunStateV1>([
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'FAILED',
  'ROLLED_BACK',
])

const transitions = {
  DRAFT: ['PLANNING', 'CANCELLED'],
  PLANNING: ['AWAITING_APPROVAL', 'QUEUED', 'FAILED', 'CANCELLED'],
  AWAITING_APPROVAL: ['QUEUED', 'REJECTED', 'CANCELLED'],
  QUEUED: ['PREPARING', 'FAILED', 'CANCELLED'],
  PREPARING: ['IMPLEMENTING', 'FAILED', 'CANCELLED'],
  IMPLEMENTING: ['VALIDATING', 'FAILED', 'CANCELLED'],
  VALIDATING: ['IMPLEMENTING', 'COMMITTING', 'FAILED', 'CANCELLED'],
  COMMITTING: ['DEPLOYING_PREVIEW', 'FAILED'],
  DEPLOYING_PREVIEW: ['VERIFYING_PREVIEW', 'FAILED'],
  VERIFYING_PREVIEW: ['READY_FOR_REVIEW', 'FAILED'],
  READY_FOR_REVIEW: ['PROMOTING', 'COMPLETED', 'REJECTED'],
  PROMOTING: ['COMPLETED', 'FAILED', 'ROLLED_BACK'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  FAILED: [],
  ROLLED_BACK: [],
} as const satisfies Record<RunStateV1, readonly RunStateV1[]>

export type TransitionAuthority = 'orchestrator'

export interface RunTransitionRequest {
  readonly authority: TransitionAuthority
  readonly correlationId: CorrelationId
  readonly from: RunStateV1
  readonly to: RunStateV1
}

export function isTerminalRunState(state: RunStateV1): boolean {
  return terminalStates.has(state)
}

export function canTransitionRun(from: RunStateV1, to: RunStateV1): boolean {
  return transitions[from].some((candidate) => candidate === to)
}

export function transitionRun(request: RunTransitionRequest): RunStateV1 {
  if (request.authority !== 'orchestrator' || !canTransitionRun(request.from, request.to)) {
    throw new PlatformError({
      code: 'INVALID_TRANSITION',
      correlationId: request.correlationId,
      retryable: false,
      safeMessage: `Run cannot transition from ${request.from} to ${request.to}.`,
    })
  }

  return request.to
}
