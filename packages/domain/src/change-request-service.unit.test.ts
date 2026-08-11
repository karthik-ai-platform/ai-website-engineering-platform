import type {
  ActorContextV1,
  ChangeRequestV1,
  CreateChangeRequestV1,
  RequirementSpecV1,
} from '@platform/contracts'
import { describe, expect, it } from 'vitest'

import type { HumanMembership, ServiceGrant } from './authorization.js'
import {
  ChangeRequestService,
  type ChangeRequestAuditEvent,
  type ChangeRequestStore,
  type RequirementRolePort,
} from './change-request-service.js'

const organizationId = '00000000-0000-4000-8000-000000000110'
const projectId = '00000000-0000-4000-8000-000000000111'
const actorId = '00000000-0000-4000-8000-000000000112'
const actor: ActorContextV1 = {
  schemaVersion: '1',
  actorId,
  actorType: 'user',
  authenticationMethod: 'test',
  correlationId: '00000000-0000-4000-8000-000000000113',
  issuedAt: '2026-08-11T00:00:00.000Z',
  organizationId,
  sessionId: '00000000-0000-4000-8000-000000000114',
  subject: 'test:actor',
}

class MemoryStore implements ChangeRequestStore {
  membership?: HumanMembership = { actorId, organizationId, role: 'developer', status: 'active' }
  grant?: ServiceGrant
  requests = new Map<string, ChangeRequestV1>()
  requirements = new Map<string, RequirementSpecV1[]>()
  audit: ChangeRequestAuditEvent[] = []
  findHumanMembership() {
    return Promise.resolve(this.membership)
  }
  findServiceGrant() {
    return Promise.resolve(this.grant)
  }
  findProjectStatus() {
    return Promise.resolve('active')
  }
  findChangeRequest(_organizationId: string, _projectId: string, id: string) {
    return Promise.resolve(this.requests.get(id))
  }
  findLatestRequirement(id: string) {
    return Promise.resolve(this.requirements.get(id)?.at(-1))
  }
  createChangeRequest(value: ChangeRequestV1, event: ChangeRequestAuditEvent) {
    this.requests.set(value.id, structuredClone(value))
    this.audit.push(event)
    return Promise.resolve()
  }
  saveRequirement(
    value: ChangeRequestV1,
    requirement: RequirementSpecV1,
    event: ChangeRequestAuditEvent,
  ) {
    this.requests.set(value.id, structuredClone(value))
    this.requirements.set(value.id, [
      ...(this.requirements.get(value.id) ?? []),
      structuredClone(requirement),
    ])
    this.audit.push(event)
    return Promise.resolve()
  }
  appendAuditEvent(event: ChangeRequestAuditEvent) {
    this.audit.push(event)
    return Promise.resolve()
  }
}

function input(mode: CreateChangeRequestV1['mode'] = 'builder'): CreateChangeRequestV1 {
  return {
    schemaVersion: '1',
    organizationId,
    projectId,
    originalPrompt: 'Add a clear hero.',
    mode,
    target: 'preview',
    constraints: ['Preserve navigation'],
    attachments: [],
  }
}

function role(outputs?: unknown[], modelWithoutEvidence = false) {
  let calls = 0
  const port: RequirementRolePort = {
    normalize({ changeRequest }) {
      const output = outputs?.[calls] ?? {
        schemaVersion: '1',
        id: '00000000-0000-4000-8000-000000000130',
        changeRequestId: changeRequest.id,
        mode: changeRequest.mode,
        summary: 'Add a clear hero.',
        goals: ['Visitors understand the offer'],
        nonGoals: [],
        assumptions: ['Existing brand remains'],
        questions: [],
        acceptanceCriteria: ['Hero has a visible heading'],
        impactedSurfaces: ['Home page'],
        constraints: changeRequest.constraints,
        riskSignals: [],
        attachmentIds: changeRequest.attachments.map((item) => item.id),
        revision: 1,
        createdAt: '2026-08-11T00:00:00.000Z',
      }
      calls += 1
      return Promise.resolve({
        output,
        evidence: modelWithoutEvidence
          ? { source: 'ai-cost-controller' as const }
          : { source: 'fixture' as const },
      })
    },
  }
  return { port, calls: () => calls }
}

function service(
  store: MemoryStore,
  requirementRole = role().port,
  scan: 'clean' | 'rejected' = 'clean',
) {
  let id = 200
  return new ChangeRequestService({
    store,
    requirementRole,
    scanner: { scan: () => Promise.resolve(scan) },
    clock: () => new Date('2026-08-11T00:00:00.000Z'),
    idFactory: () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`,
  })
}

describe('M06 change request service', () => {
  it.each([
    'builder',
    'designer',
    'refactor',
    'debug',
    'seo',
    'performance',
    'accessibility',
    'content',
  ] as const)('creates a reviewable %s requirement', async (mode) => {
    const result = await service(new MemoryStore()).create(actor, input(mode))
    expect(result.changeRequest).toMatchObject({
      mode,
      originalPrompt: 'Add a clear hero.',
      status: 'requirements_review',
    })
    expect(result.requirement).toMatchObject({ mode, revision: 1 })
  })

  it('retries one schema failure and then stops', async () => {
    const fixture = role([{ invalid: true }, { stillInvalid: true }])
    await expect(
      service(new MemoryStore(), fixture.port).create(actor, input()),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(fixture.calls()).toBe(2)
  })

  it('rejects unsafe attachments before normalization', async () => {
    const fixture = role()
    const request = input()
    request.attachments.push({
      id: '00000000-0000-4000-8000-000000000140',
      kind: 'image',
      displayName: 'reference.png',
      mediaType: 'image/png',
      sizeBytes: 120,
      digest: 'a'.repeat(64),
      artifactRef: 'artifact://reference',
      trust: 'user_supplied_untrusted',
      scanStatus: 'pending',
    })
    await expect(
      service(new MemoryStore(), fixture.port, 'rejected').create(actor, request),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(fixture.calls()).toBe(0)
  })

  it('preserves the original prompt while saving a correction', async () => {
    const store = new MemoryStore()
    const subject = service(store)
    const created = await subject.create(actor, input())
    const corrected = await subject.correct(actor, {
      schemaVersion: '1',
      organizationId,
      projectId,
      changeRequestId: created.changeRequest.id,
      expectedRevision: 1,
      rationale: 'Clarified measurable copy.',
      correctedRequirement: {
        ...created.requirement,
        summary: 'Add a concise hero.',
        goals: ['Explain the offer in one sentence'],
      },
    })
    expect(corrected).toMatchObject({ revision: 2, summary: 'Add a concise hero.' })
    expect(store.requests.get(created.changeRequest.id)?.originalPrompt).toBe('Add a clear hero.')
  })

  it('rejects model output without complete controller evidence', async () => {
    await expect(
      service(new MemoryStore(), role(undefined, true).port).create(actor, input()),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})
