import { resumeHook } from 'workflow/api'
import { requireBenchmarkAccess } from '../../../../../benchmark/guard'

export async function POST(request: Request) {
  const denied = requireBenchmarkAccess(request)
  if (denied !== undefined) return denied
  const body: unknown = await request.json().catch(() => undefined)
  if (typeof body !== 'object' || body === null)
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  const { token, approved, reviewer } = body as Record<string, unknown>
  if (
    typeof token !== 'string' ||
    !/^benchmark:[a-zA-Z0-9._-]{8,80}:approval$/u.test(token) ||
    typeof approved !== 'boolean' ||
    typeof reviewer !== 'string' ||
    !/^[a-zA-Z0-9._-]{1,80}$/u.test(reviewer)
  ) {
    return Response.json({ error: 'Invalid approval payload.' }, { status: 400 })
  }
  const hook = await resumeHook(token, { approved, reviewer })
  return Response.json({ runId: hook.runId })
}
