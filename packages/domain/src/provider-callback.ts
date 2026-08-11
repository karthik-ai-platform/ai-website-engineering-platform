import {
  callbackProcessingResultV1Schema,
  providerCallbackEnvelopeV1Schema,
  type CallbackProcessingResultV1,
  type ProviderCallbackEnvelopeV1,
} from '@platform/contracts'

export interface ProviderCallbackVerifier {
  verify(envelope: ProviderCallbackEnvelopeV1, payload: Uint8Array): Promise<boolean>
}

export interface ProviderCallbackRecord {
  readonly actorRef: string
  readonly provider: string
  readonly externalEventId: string
  readonly projectId: string
  readonly deliverySequence?: number
}

export interface ProviderCallbackStore {
  find(provider: string, externalEventId: string): Promise<ProviderCallbackRecord | undefined>
  latestSequence(provider: string, projectId: string): Promise<number | undefined>
  record(record: ProviderCallbackRecord): Promise<void>
}

export class ProviderCallbackProcessor {
  constructor(
    private readonly verifier: ProviderCallbackVerifier,
    private readonly store: ProviderCallbackStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async process(
    envelope: ProviderCallbackEnvelopeV1,
    payload: Uint8Array,
  ): Promise<CallbackProcessingResultV1> {
    const validated = providerCallbackEnvelopeV1Schema.parse(envelope)
    const base = {
      schemaVersion: '1' as const,
      externalEventId: validated.externalEventId,
      processedAt: this.clock().toISOString(),
    }
    if (!(await this.verifier.verify(validated, payload)))
      return callbackProcessingResultV1Schema.parse({ ...base, status: 'rejected' })
    if ((await this.store.find(validated.provider, validated.externalEventId)) !== undefined) {
      return callbackProcessingResultV1Schema.parse({ ...base, status: 'duplicate' })
    }
    if (validated.deliverySequence !== undefined) {
      const latest = await this.store.latestSequence(validated.provider, validated.projectId)
      if (latest !== undefined && validated.deliverySequence <= latest) {
        return callbackProcessingResultV1Schema.parse({ ...base, status: 'out_of_order' })
      }
    }
    await this.store.record({
      actorRef: validated.actorRef,
      provider: validated.provider,
      externalEventId: validated.externalEventId,
      projectId: validated.projectId,
      ...(validated.deliverySequence === undefined
        ? {}
        : { deliverySequence: validated.deliverySequence }),
    })
    return callbackProcessingResultV1Schema.parse({ ...base, status: 'accepted' })
  }
}
