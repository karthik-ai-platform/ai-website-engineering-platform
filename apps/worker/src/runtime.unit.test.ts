import { describe, expect, it } from 'vitest'

import { WorkerRuntime } from './runtime.js'

describe('worker process lifecycle', () => {
  it('enters and leaves readiness deterministically', async () => {
    const runtime = new WorkerRuntime()
    expect(runtime.ready).toBe(false)

    await runtime.start()
    expect(runtime.state).toBe('ready')
    expect(runtime.ready).toBe(true)

    await runtime.stop()
    expect(runtime.state).toBe('stopped')
    expect(runtime.ready).toBe(false)
  })

  it('rejects a duplicate start while already ready', async () => {
    const runtime = new WorkerRuntime()
    await runtime.start()
    await expect(runtime.start()).rejects.toThrow(/cannot start from ready/)
  })
})
