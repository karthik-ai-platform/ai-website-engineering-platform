import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'

import { LocalAuthenticationAdapter, OidcAuthenticationAdapter } from './authentication.js'

const correlationId = '00000000-0000-4000-8000-000000000001'
const actorId = '00000000-0000-4000-8000-000000000002'

describe('authentication adapters', () => {
  it('creates a typed actor only for an explicit local mode', async () => {
    const adapter = new LocalAuthenticationAdapter('test')

    await expect(
      adapter.authenticate({ correlationId, scheme: 'test', value: actorId }),
    ).resolves.toMatchObject({
      actorId,
      authenticationMethod: 'test',
      correlationId,
      schemaVersion: '1',
    })

    await expect(
      adapter.authenticate({ correlationId, scheme: 'development', value: actorId }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' })
  })

  it('verifies issuer, audience, signature, and required identity claims', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(publicKey)
    const keyResolver = createLocalJWKSet({
      keys: [{ ...publicJwk, alg: 'RS256', kid: 'test-key' }],
    })
    const now = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({ actor_id: actorId })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('fixture-subject')
      .setIssuer('https://identity.example.invalid/')
      .setAudience('platform')
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey)
    const adapter = new OidcAuthenticationAdapter({
      audience: 'platform',
      issuer: 'https://identity.example.invalid/',
      jwksUri: 'https://identity.example.invalid/.well-known/jwks.json',
      keyResolver,
    })

    await expect(
      adapter.authenticate({ correlationId, scheme: 'bearer', value: token }),
    ).resolves.toMatchObject({
      actorId,
      authenticationMethod: 'oidc',
      subject: 'fixture-subject',
    })
  })

  it('fails closed when the verified token does not satisfy the configured audience', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(publicKey)
    const keyResolver = createLocalJWKSet({
      keys: [{ ...publicJwk, alg: 'RS256', kid: 'test-key' }],
    })
    const token = await new SignJWT({ actor_id: actorId })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('fixture-subject')
      .setIssuer('https://identity.example.invalid/')
      .setAudience('different-audience')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
    const adapter = new OidcAuthenticationAdapter({
      audience: 'platform',
      issuer: 'https://identity.example.invalid/',
      jwksUri: 'https://identity.example.invalid/.well-known/jwks.json',
      keyResolver,
    })

    await expect(
      adapter.authenticate({ correlationId, scheme: 'bearer', value: token }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' })
  })
})
