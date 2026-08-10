import { describe, expect, it } from 'vitest'

import { loadApiConfig } from './config.js'

describe('loadApiConfig', () => {
  it('loads explicit development defaults without a database connection', () => {
    const config = loadApiConfig({})

    expect(config).toMatchObject({
      allowUnsafeLocalAuthRemote: false,
      authMode: 'development',
      databaseRequired: false,
      host: '127.0.0.1',
      nodeEnvironment: 'development',
      port: 4000,
    })
    expect(config.databaseUrl).toBeUndefined()
  })

  it('rejects development authentication in production', () => {
    expect(() =>
      loadApiConfig({
        AUTH_MODE: 'development',
        DATABASE_URL: 'postgres://user:pass@database.example.invalid/platform',
        NODE_ENV: 'production',
      }),
    ).toThrow(/Production requires AUTH_MODE=oidc/)
  })

  it('requires a PostgreSQL database in production', () => {
    expect(() =>
      loadApiConfig({
        AUTH_AUDIENCE: 'platform',
        AUTH_ISSUER: 'https://identity.example.invalid/',
        AUTH_JWKS_URI: 'https://identity.example.invalid/.well-known/jwks.json',
        AUTH_MODE: 'oidc',
        NODE_ENV: 'production',
      }),
    ).toThrow(/DATABASE_URL is required in production/)
  })

  it('requires HTTPS OIDC endpoints in production', () => {
    expect(() =>
      loadApiConfig({
        AUTH_AUDIENCE: 'platform',
        AUTH_ISSUER: 'http://identity.example.invalid/',
        AUTH_JWKS_URI: 'http://identity.example.invalid/.well-known/jwks.json',
        AUTH_MODE: 'oidc',
        DATABASE_URL: 'postgres://user:pass@database.example.invalid/platform',
        NODE_ENV: 'production',
      }),
    ).toThrow(/must use HTTPS in production/)
  })

  it('requires the complete OIDC verifier configuration', () => {
    expect(() =>
      loadApiConfig({
        AUTH_AUDIENCE: 'platform',
        AUTH_MODE: 'oidc',
        AUTH_ISSUER: 'https://identity.example.invalid/',
      }),
    ).toThrow(/authJwksUri is required/)
  })

  it('requires a PostgreSQL URL when database readiness is mandatory', () => {
    expect(() =>
      loadApiConfig({
        DATABASE_REQUIRED: 'true',
      }),
    ).toThrow(/DATABASE_URL is required/)
  })

  it('rejects non-PostgreSQL database URLs', () => {
    expect(() =>
      loadApiConfig({
        DATABASE_URL: 'https://database.example.invalid/platform',
      }),
    ).toThrow(/postgres or postgresql protocol/)
  })
})
