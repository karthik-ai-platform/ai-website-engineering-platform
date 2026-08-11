import {
  changeRequirementResultV1Schema,
  requirementSpecV1Schema,
  type ChangeRequestV1,
  type RequirementSpecV1,
} from '@platform/contracts'
import {
  ChangeRequestService,
  type ChangeRequestAuditEvent,
  type ChangeRequestStore,
  type HumanMembership,
  type RequirementRolePort,
  type ServiceGrant,
} from '@platform/domain'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApi } from './app.js'
import { loadApiConfig } from './config.js'

const actorId = '00000000-0000-4000-8000-000000000301'
const organizationId = '00000000-0000-4000-8000-000000000302'
const projectId = '00000000-0000-4000-8000-000000000303'

class MemoryStore implements ChangeRequestStore {
  membership?: HumanMembership = { actorId, organizationId, role: 'developer', status: 'active' }
  requests = new Map<string, ChangeRequestV1>()
  requirements = new Map<string, RequirementSpecV1[]>()
  audit: ChangeRequestAuditEvent[] = []
  findHumanMembership() {
    return Promise.resolve(this.membership)
  }
  findServiceGrant(): Promise<ServiceGrant | undefined> {
    return Promise.resolve(undefined)
  }
  findProjectStatus() {
    return Promise.resolve('active')
  }
  findByIdempotencyKey(_organizationId: string, _projectId: string, idempotencyKey: string) {
    return Promise.resolve(
      [...this.requests.values()].find((item) => item.idempotencyKey === idempotencyKey),
    )
  }
  findChangeRequest(_organizationId: string, _projectId: string, id: string) {
    return Promise.resolve(this.requests.get(id))
  }
  findLatestRequirement(_organizationId: string, _projectId: string, id: string) {
    return Promise.resolve(this.requirements.get(id)?.at(-1))
  }
  createChangeRequest(value: ChangeRequestV1, event: ChangeRequestAuditEvent) {
    this.requests.set(value.id, value)
    this.audit.push(event)
    return Promise.resolve()
  }
  saveRequirement(
    value: ChangeRequestV1,
    requirement: RequirementSpecV1,
    event: ChangeRequestAuditEvent,
  ) {
    this.requests.set(value.id, value)
    this.requirements.set(value.id, [...(this.requirements.get(value.id) ?? []), requirement])
    this.audit.push(event)
    return Promise.resolve()
  }
  appendAuditEvent(event: ChangeRequestAuditEvent) {
    this.audit.push(event)
    return Promise.resolve()
  }
}

const apps: ReturnType<typeof buildApi>[] = []
afterEach(async () => Promise.all(apps.splice(0).map(async (app) => app.close())))

function fixture() {
  const store = new MemoryStore()
  let roleCalls = 0
  let id = 310
  const requirementRole: RequirementRolePort = {
    normalize({ changeRequest }) {
      roleCalls += 1
      return Promise.resolve({
        evidence: { source: 'fixture' },
        output: {
          schemaVersion: '1',
          id: '00000000-0000-4000-8000-000000000320',
          changeRequestId: changeRequest.id,
          mode: changeRequest.mode,
          summary: 'Add a clear hero.',
          goals: ['Explain the offer'],
          nonGoals: [],
          assumptions: ['Brand remains unchanged'],
          questions: [],
          acceptanceCriteria: ['A visible heading explains the offer'],
          impactedSurfaces: ['Home page'],
          constraints: changeRequest.constraints,
          riskSignals: [],
          attachmentIds: [],
          revision: 1,
          createdAt: '2026-08-11T00:00:00.000Z',
        },
      })
    },
  }
  const service = new ChangeRequestService({
    store,
    requirementRole,
    scanner: { scan: () => Promise.resolve('clean') },
    clock: () => new Date('2026-08-11T00:00:00.000Z'),
    idFactory: () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`,
  })
  const api = buildApi({
    config: loadApiConfig({ AUTH_MODE: 'test', LOG_LEVEL: 'silent', NODE_ENV: 'test' }),
    changeRequestService: service,
  })
  apps.push(api)
  return { api, store, roleCalls: () => roleCalls }
}

function createPayload() {
  return {
    schemaVersion: '1',
    organizationId,
    projectId,
    idempotencyKey: 'api-fixture-1',
    originalPrompt: 'Add a clear hero.',
    mode: 'builder',
    target: 'preview',
    constraints: ['Preserve navigation'],
    attachments: [],
  }
}

describe('M06 change request API', () => {
  it('creates an authenticated reviewable requirement idempotently', async () => {
    const { api, roleCalls } = fixture()
    const request = {
      method: 'POST' as const,
      url: `/v1/projects/${projectId}/changes`,
      headers: { 'x-platform-actor-id': actorId },
      payload: createPayload(),
    }
    const first = await api.inject(request)
    const second = await api.inject(request)
    expect(first.statusCode).toBe(201)
    expect(changeRequirementResultV1Schema.parse(first.json()).changeRequest.status).toBe(
      'requirements_review',
    )
    expect(second.json()).toEqual(first.json())
    expect(roleCalls()).toBe(1)
  })

  it('saves a human correction as the next requirement revision', async () => {
    const { api, store } = fixture()
    const created = changeRequirementResultV1Schema.parse(
      (
        await api.inject({
          method: 'POST',
          url: `/v1/projects/${projectId}/changes`,
          headers: { 'x-platform-actor-id': actorId },
          payload: createPayload(),
        })
      ).json(),
    )
    const response = await api.inject({
      method: 'POST',
      url: `/v1/changes/${created.changeRequest.id}/review`,
      headers: { 'x-platform-actor-id': actorId },
      payload: {
        schemaVersion: '1',
        organizationId,
        projectId,
        changeRequestId: created.changeRequest.id,
        expectedRevision: 1,
        rationale: 'Make the goal measurable.',
        correctedRequirement: {
          ...created.requirement,
          goals: ['Explain the offer in one sentence'],
        },
      },
    })
    expect(response.statusCode).toBe(200)
    expect(requirementSpecV1Schema.parse(response.json()).revision).toBe(2)
    expect(store.requests.get(created.changeRequest.id)?.originalPrompt).toBe('Add a clear hero.')
  })

  it('rejects a project path mismatch before persistence', async () => {
    const { api, store } = fixture()
    const response = await api.inject({
      method: 'POST',
      url: '/v1/projects/00000000-0000-4000-8000-000000000399/changes',
      headers: { 'x-platform-actor-id': actorId },
      payload: createPayload(),
    })
    expect(response.statusCode).toBe(400)
    expect(store.requests.size).toBe(0)
  })
})
