import { getRun, resumeHook, start } from 'workflow/api'
import { waitForHook, waitForSleep } from '@workflow/vitest'
import { describe, expect, it } from 'vitest'
import {
  approvalToken,
  workflowDurabilityBenchmark,
  type WorkflowBenchmarkInput,
} from './workflow-benchmark'

describe('Workflow durability benchmark', () => {
  it('runs basic, parallel, and serializable-payload scenarios', async () => {
    for (const [scenario, payload] of [
      ['basic', 'fixture'],
      ['parallel', 'fixture'],
      ['payload', 'x'.repeat(262_144)],
    ] as const) {
      const run = await start(workflowDurabilityBenchmark, [input(scenario, payload)])
      const result = await run.returnValue
      expect(result.input.payload).toHaveLength(payload.length)
      expect(await run.status).toBe('completed')
    }
  })

  it('recovers after an injected transient failure with retry evidence', async () => {
    const run = await start(workflowDurabilityBenchmark, [input('transient-failure')])
    const result = await run.returnValue
    expect(result.steps.at(-1)).toMatchObject({ attempt: 2, label: 'transient-recovery' })
  })

  it('pauses for approval and durable sleep, then resumes', async () => {
    const approval = await start(workflowDurabilityBenchmark, [input('approval')])
    const hookRef = approvalToken('benchmark-run')
    await waitForHook(approval, { token: hookRef })
    await resumeHook(hookRef, { approved: true, reviewer: 'fixture' })
    await expect(approval.returnValue).resolves.toMatchObject({ engine: 'vercel-workflow' })

    const sleeping = await start(workflowDurabilityBenchmark, [input('durable-sleep')])
    const sleepId = await waitForSleep(sleeping)
    await getRun(sleeping.runId).wakeUp({ correlationIds: [sleepId] })
    await expect(sleeping.returnValue).resolves.toMatchObject({ engine: 'vercel-workflow' })
  })

  it('records forced permanent failure and supports cancellation', async () => {
    const failed = await start(workflowDurabilityBenchmark, [input('permanent-failure')])
    await expect(failed.returnValue).rejects.toThrow(/permanent failure/u)
    expect(await failed.status).toBe('failed')

    const waiting = await start(workflowDurabilityBenchmark, [
      input('approval', 'fixture', 'cancel-run'),
    ])
    const hookRef = approvalToken('cancel-run')
    await waitForHook(waiting, { token: hookRef })
    await getRun(waiting.runId).cancel()
    expect(await waiting.status).toBe('cancelled')
  })
})

function input(
  scenario: WorkflowBenchmarkInput['scenario'],
  payload = 'fixture',
  runKey = 'benchmark-run',
): WorkflowBenchmarkInput {
  return { payload, runKey, scenario, sleepMs: 60_000 }
}
