import { describe, expect, it } from 'vitest'

import { PlatformError } from './error.js'
import { canTransitionRun, isTerminalRunState, transitionRun } from './run-state.js'

const correlationId = '00000000-0000-4000-8000-000000000001'

describe('deterministic run state policy', () => {
  it('permits the configured orchestrator transition', () => {
    expect(
      transitionRun({
        authority: 'orchestrator',
        correlationId,
        from: 'DRAFT',
        to: 'PLANNING',
      }),
    ).toBe('PLANNING')
  })

  it('rejects a skipped privileged transition', () => {
    expect(() =>
      transitionRun({
        authority: 'orchestrator',
        correlationId,
        from: 'DRAFT',
        to: 'COMMITTING',
      }),
    ).toThrow(PlatformError)
  })

  it('does not allow transitions out of terminal states', () => {
    for (const state of ['COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED', 'ROLLED_BACK'] as const) {
      expect(isTerminalRunState(state)).toBe(true)
      expect(canTransitionRun(state, 'PLANNING')).toBe(false)
    }
  })

  it('supports a bounded repair return from validation to implementation', () => {
    expect(canTransitionRun('VALIDATING', 'IMPLEMENTING')).toBe(true)
  })
})
