import type { RunStateV1, WorkflowCommandV1, WorkflowEventV1 } from '@platform/contracts'

export interface TransitionRecord {
  readonly event: WorkflowEventV1
  readonly state: RunStateV1
}

/**
 * Persistence/orchestration seam only. An implementation is not durable until
 * it passes the ADR-007 durability, replay, cancellation, and recovery gates.
 */
export interface OrchestrationStore {
  appendTransition(command: WorkflowCommandV1, event: WorkflowEventV1): Promise<TransitionRecord>
}
