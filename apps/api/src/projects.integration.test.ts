import { apiErrorResponseV1Schema, projectV1Schema, type ProjectV1 } from '@platform/contracts'
import type {
  HumanMembership,
  ProjectAuditEvent,
  ProjectPolicyReference,
  ProjectStore,
  ServiceGrant,
} from '@platform/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApi } from './app.js'
import { loadApiConfig } from './config.js'

const actorId = '00000000-0000-4000-8000-000000000001'
const organizationId = '00000000-0000-4000-8000-000000000002'
const policyId = '00000000-0000-4000-8000-000000000003'

class MemoryProjectStore implements ProjectStore {
  membership?: HumanMembership
  projects = new Map<string, ProjectV1>()
  audit: ProjectAuditEvent[] = []
  findHumanMembership() {
    return Promise.resolve(this.membership)
  }
  findServiceGrant(): Promise<ServiceGrant | undefined> {
    return Promise.resolve(undefined)
  }
  findPolicy(_organizationId: string, id: string): Promise<ProjectPolicyReference | undefined> {
    return Promise.resolve(
      id === policyId ? { id, deletionRetentionDays: 7, status: 'active' } : undefined,
    )
  }
  findProject(_organizationId: string, id: string) {
    return Promise.resolve(this.projects.get(id))
  }
  createProject(project: ProjectV1, event: ProjectAuditEvent) {
    this.projects.set(project.id, project)
    this.audit.push(event)
    return Promise.resolve()
  }
  updateProject(project: ProjectV1, event: ProjectAuditEvent) {
    this.projects.set(project.id, project)
    this.audit.push(event)
    return Promise.resolve()
  }
  appendAuditEvent(event: ProjectAuditEvent) {
    this.audit.push(event)
    return Promise.resolve()
  }
}

const apps: ReturnType<typeof buildApi>[] = []
afterEach(async () => Promise.all(apps.splice(0).map(async (app) => app.close())))

function app(store: MemoryProjectStore) {
  const instance = buildApi({
    config: loadApiConfig({ AUTH_MODE: 'test', LOG_LEVEL: 'silent', NODE_ENV: 'test' }),
    projectStore: store,
  })
  apps.push(instance)
  return instance
}

describe('M02 project API', () => {
  it('creates and lifecycle-transitions a tenant-scoped project', async () => {
    const store = new MemoryProjectStore()
    store.membership = { actorId, organizationId, role: 'owner', status: 'active' }
    const api = app(store)
    const createdResponse = await api.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { 'x-platform-actor-id': actorId },
      payload: { schemaVersion: '1', organizationId, name: 'Site', slug: 'site', policyId },
    })
    const created = projectV1Schema.parse(createdResponse.json())
    expect(createdResponse.statusCode).toBe(201)

    const archivedResponse = await api.inject({
      method: 'POST',
      url: `/v1/projects/${created.id}/lifecycle`,
      headers: { 'x-platform-actor-id': actorId },
      payload: {
        schemaVersion: '1',
        organizationId,
        projectId: created.id,
        action: 'archive',
        expectedUpdatedAt: created.updatedAt,
      },
    })
    expect(projectV1Schema.parse(archivedResponse.json()).status).toBe('archived')
    expect(store.audit.filter(({ outcome }) => outcome === 'allowed')).toHaveLength(2)
  })

  it('returns a typed denial and appends audit evidence', async () => {
    const store = new MemoryProjectStore()
    store.membership = { actorId, organizationId, role: 'viewer', status: 'active' }
    const response = await app(store).inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { 'x-platform-actor-id': actorId },
      payload: { schemaVersion: '1', organizationId, name: 'No', slug: 'no', policyId },
    })
    expect(response.statusCode).toBe(403)
    expect(apiErrorResponseV1Schema.parse(response.json()).error.code).toBe('AUTHORIZATION_DENIED')
    expect(store.audit).toEqual([expect.objectContaining({ outcome: 'denied' })])
  })

  it('rejects a path/body project mismatch before mutation', async () => {
    const store = new MemoryProjectStore()
    store.membership = { actorId, organizationId, role: 'owner', status: 'active' }
    const response = await app(store).inject({
      method: 'POST',
      url: '/v1/projects/00000000-0000-4000-8000-000000000090/lifecycle',
      headers: { 'x-platform-actor-id': actorId },
      payload: {
        schemaVersion: '1',
        organizationId,
        projectId: '00000000-0000-4000-8000-000000000091',
        action: 'archive',
      },
    })
    expect(response.statusCode).toBe(400)
    expect(apiErrorResponseV1Schema.parse(response.json()).error.code).toBe('VALIDATION_FAILED')
  })
})
