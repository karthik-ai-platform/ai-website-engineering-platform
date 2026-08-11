import { githubRepositoryReadinessV1Schema, type ProjectV1 } from '@platform/contracts'
import { GithubOnboardingService } from '@platform/domain'
import {
  GithubAppAdapter,
  MemoryGithubOnboardingStore,
  MockGithubInstallationClient,
} from '@platform/github-adapter'
import { MockSecretsAdapter } from '@platform/provider-framework'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApi } from './app.js'
import { loadApiConfig } from './config.js'

const actorId = '00000000-0000-4000-8000-000000000301'
const organizationId = '00000000-0000-4000-8000-000000000302'
const projectId = '00000000-0000-4000-8000-000000000303'
const project: ProjectV1 = {
  schemaVersion: '1',
  id: projectId,
  organizationId,
  name: 'API fixture',
  slug: 'api-fixture',
  pluginType: 'website',
  policyId: '00000000-0000-4000-8000-000000000304',
  status: 'active',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
}

const apps: ReturnType<typeof buildApi>[] = []
afterEach(async () => Promise.all(apps.splice(0).map(async (app) => app.close())))

describe('M04 GitHub onboarding API', () => {
  it('initiates and completes fixture onboarding without returning credential references', async () => {
    const store = new MemoryGithubOnboardingStore()
    store.projects.set(`${organizationId}:${projectId}`, project)
    store.memberships.set(`${organizationId}:${actorId}`, {
      actorId,
      organizationId,
      role: 'owner',
      status: 'active',
    })
    const credentialRef = {
      schemaVersion: '1' as const,
      provider: 'fixture-vault',
      key: 'github/app/private-key',
    }
    const secrets = new MockSecretsAdapter()
    secrets.register(credentialRef)
    const service = new GithubOnboardingService({
      adapter: new GithubAppAdapter(
        'platform-fixture',
        new MockGithubInstallationClient({
          schemaVersion: '1',
          installationId: '401',
          repositoryId: '402',
          owner: 'fixture',
          name: 'website',
          defaultBranch: 'main',
          indexedCommit: 'c'.repeat(40),
          permissions: { metadata: 'read', contents: 'read', pullRequests: 'none' },
        }),
      ),
      appCredentialRef: credentialRef,
      idFactory: (() => {
        let id = 410
        return () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`
      })(),
      secrets,
      stateFactory: () => 'api-fixture-state-with-more-than-32-characters',
      store,
    })
    const api = buildApi({
      config: loadApiConfig({ AUTH_MODE: 'test', LOG_LEVEL: 'silent', NODE_ENV: 'test' }),
      githubOnboardingService: service,
    })
    apps.push(api)

    const initiatedResponse = await api.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/repository/github/initiate`,
      headers: { 'x-platform-actor-id': actorId },
      payload: {
        schemaVersion: '1',
        organizationId,
        projectId,
        returnUrl: 'https://platform.example.invalid/settings/integrations',
      },
    })
    expect(initiatedResponse.statusCode).toBe(201)
    const initiated = initiatedResponse.json<{
      attemptId: string
      authorizationUrl: string
    }>()
    const state = new URL(initiated.authorizationUrl).searchParams.get('state')

    const completedResponse = await api.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/repository/github/complete`,
      headers: { 'x-platform-actor-id': actorId },
      payload: {
        schemaVersion: '1',
        organizationId,
        projectId,
        attemptId: initiated.attemptId,
        state,
        installationId: '401',
        repositoryId: '402',
      },
    })
    expect(completedResponse.statusCode).toBe(200)
    const readiness = githubRepositoryReadinessV1Schema.parse(completedResponse.json())
    expect(readiness).toMatchObject({ readiness: 'ready', indexedCommit: 'c'.repeat(40) })
    expect(completedResponse.body).not.toMatch(/credential|private-key|token/iu)
  })
})
