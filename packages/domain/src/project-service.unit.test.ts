import type { ActorContextV1, ProjectV1 } from '@platform/contracts'
import { describe, expect, it } from 'vitest'
import type { HumanMembership, ServiceGrant } from './authorization.js'
import {
  ProjectService,
  type ProjectAuditEvent,
  type ProjectPolicyReference,
  type ProjectStore,
} from './project-service.js'

const organizationId = '00000000-0000-4000-8000-000000000010'
const policyId = '00000000-0000-4000-8000-000000000011'
const actorId = '00000000-0000-4000-8000-000000000012'
const actor = (actorType: 'user' | 'service' = 'user'): ActorContextV1 => ({
  schemaVersion: '1',
  actorId,
  actorType,
  authenticationMethod: 'test',
  correlationId: '00000000-0000-4000-8000-000000000013',
  issuedAt: '2026-08-11T00:00:00.000Z',
  organizationId,
  sessionId: '00000000-0000-4000-8000-000000000014',
  subject: 'test:actor',
})

class MemoryStore implements ProjectStore {
  membership?: HumanMembership
  grant?: ServiceGrant
  policy?: ProjectPolicyReference = { id: policyId, deletionRetentionDays: 30, status: 'active' }
  projects = new Map<string, ProjectV1>()
  audit: ProjectAuditEvent[] = []
  findHumanMembership() {
    return Promise.resolve(this.membership)
  }
  findServiceGrant() {
    return Promise.resolve(this.grant)
  }
  findPolicy() {
    return Promise.resolve(this.policy)
  }
  findProject(_organizationId: string, projectId: string) {
    return Promise.resolve(this.projects.get(projectId))
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

function service(store: MemoryStore) {
  let id = 20
  return new ProjectService({
    store,
    clock: () => new Date('2026-08-11T00:00:00.000Z'),
    idFactory: () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`,
  })
}

describe('M02 project service', () => {
  it('rejects and audits an unauthorized action', async () => {
    const store = new MemoryStore()
    await expect(
      service(store).create(actor(), {
        schemaVersion: '1',
        organizationId,
        name: 'Denied',
        slug: 'denied',
        policyId,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' })
    expect(store.audit).toEqual([
      expect.objectContaining({ action: 'authorization.project:create', outcome: 'denied' }),
    ])
  })

  it('creates, archives, restores, and schedules deletion under retention', async () => {
    const store = new MemoryStore()
    store.membership = { actorId, organizationId, role: 'owner', status: 'active' }
    const subject = service(store)
    const created = await subject.create(actor(), {
      schemaVersion: '1',
      organizationId,
      name: 'Website',
      slug: 'website',
      policyId,
    })
    const archived = await subject.transition(
      actor(),
      organizationId,
      created.id,
      'archive',
      created.updatedAt,
    )
    const restored = await subject.transition(
      actor(),
      organizationId,
      created.id,
      'restore',
      archived.updatedAt,
    )
    const pending = await subject.transition(
      actor(),
      organizationId,
      created.id,
      'delete',
      restored.updatedAt,
    )
    expect([created.status, archived.status, restored.status, pending.status]).toEqual([
      'active',
      'archived',
      'active',
      'deletion_pending',
    ])
    expect(pending.retentionUntil).toBe('2026-09-10T00:00:00.000Z')
  })

  it('rechecks delayed authorization after membership revocation', async () => {
    const store = new MemoryStore()
    store.membership = { actorId, organizationId, role: 'owner', status: 'active' }
    const subject = service(store)
    const project = await subject.create(actor(), {
      schemaVersion: '1',
      organizationId,
      name: 'Website',
      slug: 'website',
      policyId,
    })
    store.membership = { ...store.membership, status: 'revoked' }
    await expect(
      subject.transition(actor(), organizationId, project.id, 'archive', project.updatedAt),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' })
    expect(store.audit.at(-1)).toMatchObject({
      outcome: 'denied',
      payloadRef: 'reason:membership_inactive',
    })
  })

  it('does not let a service identity escape its project scope', async () => {
    const store = new MemoryStore()
    store.grant = {
      actorId,
      organizationId,
      projectId: '00000000-0000-4000-8000-000000000099',
      permissions: ['project:archive'],
      status: 'active',
    }
    await expect(
      service(store).transition(
        actor('service'),
        organizationId,
        '00000000-0000-4000-8000-000000000098',
        'archive',
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' })
  })
})
