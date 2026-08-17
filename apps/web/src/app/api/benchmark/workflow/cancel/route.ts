import { getRun } from 'workflow/api'
import { requireBenchmarkAccess } from '../../../../../benchmark/guard'

export async function POST(request: Request) {
  const denied = requireBenchmarkAccess(request)
  if (denied !== undefined) return denied
  const body: unknown = await request.json().catch(() => undefined)
  const runId =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)['runId']
      : undefined
  if (typeof runId !== 'string' || !/^wrun_[a-zA-Z0-9_-]+$/u.test(runId))
    return Response.json({ error: 'Invalid run ID.' }, { status: 400 })
  const run = getRun(runId)
  if (!(await run.exists)) return Response.json({ error: 'Run not found.' }, { status: 404 })
  await run.cancel()
  return Response.json({ runId, status: await run.status })
}
