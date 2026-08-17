export function requireBenchmarkAccess(request: Request): Response | undefined {
  if (process.env['VERCEL_ENV'] !== 'preview' && process.env['NODE_ENV'] !== 'test') {
    return Response.json({ error: 'Benchmark endpoints are preview-only.' }, { status: 404 })
  }
  const expected = process.env['BENCHMARK_API_TOKEN']
  const supplied = request.headers.get('authorization')
  if (expected === undefined || expected.length < 32 || supplied !== `Bearer ${expected}`) {
    return Response.json({ error: 'Benchmark authorization failed.' }, { status: 401 })
  }
}
