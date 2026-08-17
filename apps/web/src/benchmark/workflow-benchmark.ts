import { createHook, FatalError, getStepMetadata, RetryableError, sleep } from 'workflow'

export const workflowBenchmarkScenarios = [
  'basic',
  'transient-failure',
  'durable-sleep',
  'approval',
  'parallel',
  'permanent-failure',
  'replay-recovery',
  'payload',
] as const
export type WorkflowBenchmarkScenario = (typeof workflowBenchmarkScenarios)[number]
export interface WorkflowBenchmarkInput {
  readonly payload: string
  readonly runKey: string
  readonly scenario: WorkflowBenchmarkScenario
  readonly sleepMs: number
}

export async function workflowDurabilityBenchmark(input: WorkflowBenchmarkInput) {
  'use workflow'
  const started = await measure('start', input.payload)
  if (input.scenario === 'transient-failure' || input.scenario === 'replay-recovery') {
    return result(input, started, [await transientFailure()])
  }
  if (input.scenario === 'durable-sleep') {
    await sleep(input.sleepMs)
    return result(input, started, [await measure('after-sleep', input.payload)])
  }
  if (input.scenario === 'approval') {
    const hookRef = approvalToken(input.runKey)
    using approval = createHook<{ approved: boolean; reviewer: string }>({
      token: hookRef,
    })
    const decision = await approval
    if (!decision.approved) throw new Error('Benchmark approval was rejected.')
    return result(input, started, [await measure(`approved:${decision.reviewer}`, input.payload)])
  }
  if (input.scenario === 'parallel') {
    const parallel = await Promise.all([
      measure('parallel-a', input.payload),
      measure('parallel-b', input.payload),
      measure('parallel-c', input.payload),
    ])
    return result(input, started, parallel)
  }
  if (input.scenario === 'permanent-failure') await permanentFailure()
  return result(input, started, [await measure('complete', input.payload)])
}

async function measure(label: string, payload: string) {
  'use step'
  const startedAt = Date.now()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return {
    attempt: getStepMetadata().attempt,
    digest: Buffer.from(digest).toString('hex'),
    durationMs: Date.now() - startedAt,
    label,
    payloadBytes: Buffer.byteLength(payload),
  }
}
async function transientFailure() {
  'use step'
  await Promise.resolve()
  const { attempt } = getStepMetadata()
  if (attempt === 1)
    throw new RetryableError('Injected benchmark transient failure.', { retryAfter: 10 })
  return {
    attempt,
    digest: 'recovered',
    durationMs: 0,
    label: 'transient-recovery',
    payloadBytes: 0,
  }
}
transientFailure.maxRetries = 2
async function permanentFailure() {
  'use step'
  await Promise.resolve()
  throw new FatalError('Injected benchmark permanent failure.')
}
permanentFailure.maxRetries = 0
function result(
  input: WorkflowBenchmarkInput,
  started: Awaited<ReturnType<typeof measure>>,
  steps: Awaited<ReturnType<typeof measure>>[],
) {
  return { engine: 'vercel-workflow', input, steps: [started, ...steps] }
}
export function approvalToken(runKey: string) {
  return `benchmark:${runKey}:approval`
}
