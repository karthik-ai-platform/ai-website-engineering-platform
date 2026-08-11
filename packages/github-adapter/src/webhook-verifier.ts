import { createHmac, timingSafeEqual } from 'node:crypto'

import type { ProviderCallbackEnvelopeV1 } from '@platform/contracts'
import type { ProviderCallbackVerifier } from '@platform/domain'

export class GithubWebhookVerifier implements ProviderCallbackVerifier {
  constructor(private readonly webhookSecret: Uint8Array) {}

  verify(envelope: ProviderCallbackEnvelopeV1, payload: Uint8Array): Promise<boolean> {
    return Promise.resolve(this.verifySignature(envelope.signature, payload))
  }

  verifySignature(signature: string, payload: Uint8Array): boolean {
    if (!signature.startsWith('sha256=')) return false
    const expected = Buffer.from(
      createHmac('sha256', this.webhookSecret).update(payload).digest('hex'),
    )
    const received = Buffer.from(signature.slice('sha256='.length))
    return expected.length === received.length && timingSafeEqual(expected, received)
  }
}
