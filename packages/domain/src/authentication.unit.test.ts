import { describe, expect, it } from 'vitest'

import { DenyAllAuthentication } from './authentication.js'

describe('deny-by-default authentication port', () => {
  it('rejects credentials when no authenticated adapter is composed', async () => {
    const authentication = new DenyAllAuthentication()

    await expect(
      authentication.authenticate({
        correlationId: '00000000-0000-4000-8000-000000000001',
        scheme: 'test',
        value: 'placeholder-credential',
      }),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
      retryable: false,
    })
  })
})
