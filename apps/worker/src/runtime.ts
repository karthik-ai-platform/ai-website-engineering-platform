export type WorkerLifecycleState = 'idle' | 'starting' | 'ready' | 'stopping' | 'stopped'

/**
 * Process lifecycle only. This does not claim workflow durability or execute
 * untrusted repository code; those remain behind later orchestration/runner adapters.
 */
export class WorkerRuntime {
  #state: WorkerLifecycleState = 'idle'

  get state(): WorkerLifecycleState {
    return this.#state
  }

  get ready(): boolean {
    return this.#state === 'ready'
  }

  async start(): Promise<void> {
    if (this.#state !== 'idle' && this.#state !== 'stopped') {
      throw new Error(`Worker cannot start from ${this.#state}.`)
    }

    this.#state = 'starting'
    await Promise.resolve()
    this.#state = 'ready'
  }

  async stop(): Promise<void> {
    if (this.#state === 'stopped') return
    if (this.#state !== 'ready' && this.#state !== 'starting' && this.#state !== 'idle') {
      throw new Error(`Worker cannot stop from ${this.#state}.`)
    }

    this.#state = 'stopping'
    await Promise.resolve()
    this.#state = 'stopped'
  }
}
