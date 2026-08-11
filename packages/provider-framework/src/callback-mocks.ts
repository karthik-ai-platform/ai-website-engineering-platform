import { createHash, timingSafeEqual } from 'node:crypto'
import type { ProviderCallbackEnvelopeV1 } from '@platform/contracts'
import type {
  ProviderCallbackRecord,
  ProviderCallbackStore,
  ProviderCallbackVerifier,
} from '@platform/domain'

export class DigestCallbackVerifier implements ProviderCallbackVerifier {
  constructor(private readonly expectedSignature: string) {}
  verify(envelope: ProviderCallbackEnvelopeV1, payload: Uint8Array): Promise<boolean> {
    const digest = createHash('sha256').update(payload).digest('hex')
    const supplied = Buffer.from(envelope.signature)
    const expected = Buffer.from(this.expectedSignature)
    return Promise.resolve(
      digest === envelope.payloadDigest &&
        supplied.length === expected.length &&
        timingSafeEqual(supplied, expected),
    )
  }
}

export class MemoryProviderCallbackStore implements ProviderCallbackStore {
  readonly #records = new Map<string, ProviderCallbackRecord>()
  find(provider: string, externalEventId: string) {
    return Promise.resolve(this.#records.get(`${provider}:${externalEventId}`))
  }
  latestSequence(provider: string, projectId: string): Promise<number | undefined> {
    const values = [...this.#records.values()]
      .filter((record) => record.provider === provider && record.projectId === projectId)
      .flatMap((record) => (record.deliverySequence === undefined ? [] : [record.deliverySequence]))
    return Promise.resolve(values.length === 0 ? undefined : Math.max(...values))
  }
  record(record: ProviderCallbackRecord): Promise<void> {
    this.#records.set(`${record.provider}:${record.externalEventId}`, record)
    return Promise.resolve()
  }
}
