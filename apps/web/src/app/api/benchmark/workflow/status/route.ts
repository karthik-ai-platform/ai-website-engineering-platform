import { getRun } from 'workflow/api'
import { requireBenchmarkAccess } from '../../../../../benchmark/guard'

export async function GET(request: Request) {
  const denied = requireBenchmarkAccess(request)
  if (denied !== undefined) return denied
  const runId = new URL(request.url).searchParams.get('runId')
  if (runId === null || !/^wrun_[a-zA-Z0-9_-]+$/u.test(runId))
    return Response.json({ error: 'Invalid run ID.' }, { status: 400 })
  const run = getRun(runId)
  if (!(await run.exists)) return Response.json({ error: 'Run not found.' }, { status: 404 })
  const status = await run.status
  const result = status === 'completed' ? await run.returnValue : undefined
  return Response.json({ result, runId, status })
}
