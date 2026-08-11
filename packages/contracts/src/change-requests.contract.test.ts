import { describe, expect, it } from 'vitest'

import {
  changeModeV1Schema,
  createChangeRequestV1Schema,
  requirementSpecV1Schema,
} from './index.js'

const organizationId = '00000000-0000-4000-8000-000000000210'
const projectId = '00000000-0000-4000-8000-000000000211'
const changeRequestId = '00000000-0000-4000-8000-000000000212'

describe('M06 change request contracts', () => {
  it('supports every SRS intake mode', () => {
    expect(changeModeV1Schema.options).toEqual([
      'builder',
      'designer',
      'refactor',
      'debug',
      'seo',
      'performance',
      'accessibility',
      'content',
    ])
  })

  it('requires explicit untrusted attachment metadata', () => {
    const base = {
      schemaVersion: '1',
      organizationId,
      projectId,
      originalPrompt: 'Improve the hero.',
      mode: 'designer',
      target: 'preview',
      constraints: [],
      attachments: [
        {
          id: '00000000-0000-4000-8000-000000000213',
          kind: 'image',
          displayName: 'hero.png',
          mediaType: 'image/png',
          sizeBytes: 10,
          digest: 'a'.repeat(64),
          artifactRef: 'artifact://hero',
          scanStatus: 'pending',
        },
      ],
    }
    expect(() => createChangeRequestV1Schema.parse(base)).toThrow()
    expect(
      createChangeRequestV1Schema.parse({
        ...base,
        attachments: [{ ...base.attachments[0], trust: 'user_supplied_untrusted' }],
      }).attachments[0]?.trust,
    ).toBe('user_supplied_untrusted')
  })

  it('rejects prose and unknown authority fields in requirement output', () => {
    const requirement = {
      schemaVersion: '1',
      id: '00000000-0000-4000-8000-000000000214',
      changeRequestId,
      mode: 'builder',
      summary: 'Build a hero.',
      goals: ['Explain value'],
      nonGoals: [],
      assumptions: [],
      questions: [],
      acceptanceCriteria: ['Heading is visible'],
      impactedSurfaces: ['Home page'],
      constraints: [],
      riskSignals: [],
      attachmentIds: [],
      revision: 1,
      createdAt: '2026-08-11T00:00:00.000Z',
    }
    expect(requirementSpecV1Schema.parse(requirement).goals).toEqual(['Explain value'])
    expect(() =>
      requirementSpecV1Schema.parse({ ...requirement, approvedForExecution: true }),
    ).toThrow()
    expect(() =>
      requirementSpecV1Schema.parse({ ...requirement, acceptanceCriteria: [] }),
    ).toThrow()
  })
})
