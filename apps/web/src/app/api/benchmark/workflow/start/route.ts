import { start } from 'workflow/api'
import { requireBenchmarkAccess } from '../../../../../benchmark/guard'
import {
  workflowBenchmarkScenarios,
  workflowDurabilityBenchmark,
  type WorkflowBenchmarkScenario,
} from '../../../../../benchmark/workflow-benchmark'

export async function POST(request: Request) {
  const denied = requireBenchmarkAccess(request)
  if (denied !== undefined) return denied
  const input = await parseInput(request)
  if (input instanceof Response) return input
  const run = await start(workflowDurabilityBenchmark, [input])
  return Response.json(
    {
      approvalHandle:
        input.scenario === 'approval' ? `benchmark:${input.runKey}:approval` : undefined,
      engine: 'workflow',
      runId: run.runId,
      sdkVersion: '5.0.0-beta.42',
    },
    { status: 202 },
  )
}

async function parseInput(request: Request) {
  const value: unknown = await request.json().catch(() => undefined)
  if (typeof value !== 'object' || value === null)
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  const body = value as Record<string, unknown>
  const scenario = body['scenario']
  const runKey = body['runKey']
  const payloadBytes = body['payloadBytes'] ?? 1024
  const sleepMs = body['sleepMs'] ?? 1000
  if (
    typeof scenario !== 'string' ||
    !workflowBenchmarkScenarios.includes(scenario as WorkflowBenchmarkScenario) ||
    typeof runKey !== 'string' ||
    !/^[a-zA-Z0-9._-]{8,80}$/u.test(runKey) ||
    !Number.isInteger(payloadBytes) ||
    Number(payloadBytes) < 0 ||
    Number(payloadBytes) > 1_048_576 ||
    !Number.isInteger(sleepMs) ||
    Number(sleepMs) < 1 ||
    Number(sleepMs) > 86_400_000
  ) {
    return Response.json({ error: 'Benchmark input is invalid.' }, { status: 400 })
  }
  return {
    payload: syntheticPayload(Number(payloadBytes)),
    runKey,
    scenario: scenario as WorkflowBenchmarkScenario,
    sleepMs: Number(sleepMs),
  }
}
function syntheticPayload(bytes: number) {
  return '0123456789abcdef'.repeat(Math.ceil(bytes / 16)).slice(0, bytes)
}
