import { createHash } from 'node:crypto'

import type { ProviderRequestContextV1, RepositoryRetrievalRequestV1 } from '@platform/contracts'
import { MockArtifactStore } from '@platform/provider-framework'
import { describe, expect, it } from 'vitest'

import { MemoryRepositoryIndexStore } from './index-store.js'
import { RepositoryIndexer } from './indexer.js'
import { RepositoryRetriever } from './retriever.js'
import type { RepositorySnapshot, RepositorySnapshotFile } from './types.js'

const organizationId = '00000000-0000-4000-8000-000000000501'
const projectId = '00000000-0000-4000-8000-000000000502'
const commit = 'a'.repeat(40)
const configurationDigest = createHash('sha256').update('fixture-config-v1').digest('hex')
const context: ProviderRequestContextV1 = {
  schemaVersion: '1',
  organizationId,
  projectId,
  actorRef: 'service:00000000-0000-4000-8000-000000000503',
  correlationId: '00000000-0000-4000-8000-000000000504',
  idempotencyKey: 'repository-index-fixture',
  requestedAt: '2026-08-11T00:00:00.000Z',
}

const text = (path: string, content: string): RepositorySnapshotFile => ({
  path,
  content: new TextEncoder().encode(content),
})

function fixtureFiles(): readonly RepositorySnapshotFile[] {
  return [
    text('AGENTS.md', '# Instructions\nUse strict TypeScript and preserve evidence.'),
    text('.github/CODEOWNERS', '/src/components/ @frontend-team'),
    text(
      'package.json',
      JSON.stringify({
        scripts: { build: 'next build', test: 'vitest run' },
        dependencies: { next: '16.3.0', react: '19.2.8' },
      }),
    ),
    text('package-lock.json', '{"lockfileVersion":3}'),
    text(
      'src/app/page.tsx',
      "import { Hero } from '../components/Hero'\nexport default function Page(){return <Hero />}\n",
    ),
    text(
      'src/components/Hero.tsx',
      "export function Hero(){ return <section aria-label='Landing hero'>Welcome</section> }\n",
    ),
    text(
      'src/components/Hero.test.tsx',
      "import { Hero } from './Hero'\nexport const caseName='hero'",
    ),
    text(
      'src/components/Hero.stories.tsx',
      "import { Hero } from './Hero'\nexport default {component:Hero}",
    ),
    text('next.config.ts', 'export default { reactStrictMode: true }'),
    text('.env.local', 'EXAMPLE_SETTING=redacted'),
    text('src/leaked-config.ts', 'api_key=example-sensitive-value-1234567890'),
    text('dist/bundle.js', 'generated bundle'),
    text('node_modules/vendor/index.js', 'vendored source'),
    { path: 'public/logo.png', content: new Uint8Array([137, 80, 78, 71, 0, 1]) },
    text('docs/oversized.txt', 'x'.repeat(200)),
  ]
}

function snapshot(
  overrides: Partial<RepositorySnapshot> = {},
  files = fixtureFiles(),
): RepositorySnapshot {
  return {
    context,
    repositoryId: 'fixture-repository',
    commit,
    configurationDigest,
    files,
    recentCommits: [{ commit: 'b'.repeat(40), summary: 'Add landing hero component' }],
    ...overrides,
  }
}

describe('M05 deterministic repository map', () => {
  it('produces the reviewed Next.js/TypeScript fixture map and policy exclusions', async () => {
    const index = await new RepositoryIndexer({
      maximumFileBytes: 128,
      store: new MemoryRepositoryIndexStore(),
    }).index(snapshot())

    expect(index.map.files.map(({ provenance }) => provenance.path)).toEqual([
      '.github/CODEOWNERS',
      'AGENTS.md',
      'next.config.ts',
      'package-lock.json',
      'package.json',
      'src/app/page.tsx',
      'src/components/Hero.stories.tsx',
      'src/components/Hero.test.tsx',
      'src/components/Hero.tsx',
    ])
    expect(index.map.exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '.env.local', reason: 'secret' }),
        expect.objectContaining({ path: 'src/leaked-config.ts', reason: 'secret' }),
        expect.objectContaining({ path: 'dist/bundle.js', reason: 'generated' }),
        expect.objectContaining({ path: 'node_modules/vendor/index.js', reason: 'vendor' }),
        expect.objectContaining({ path: 'public/logo.png', reason: 'binary' }),
        expect.objectContaining({ path: 'docs/oversized.txt', reason: 'large' }),
      ]),
    )
    expect(index.map.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'framework', name: 'next' }),
        expect.objectContaining({ kind: 'package_manager', name: 'npm' }),
        expect.objectContaining({ kind: 'script', name: 'build', detail: 'next build' }),
        expect.objectContaining({ kind: 'route', name: '/' }),
        expect.objectContaining({ kind: 'component', name: 'Hero' }),
        expect.objectContaining({ kind: 'import', name: '../components/Hero' }),
        expect.objectContaining({ kind: 'export', name: 'Hero' }),
        expect.objectContaining({ kind: 'story', name: 'src/components/Hero.stories.tsx' }),
        expect.objectContaining({ kind: 'test', name: 'src/components/Hero.test.tsx' }),
        expect.objectContaining({ kind: 'instruction', name: 'AGENTS.md' }),
        expect.objectContaining({ kind: 'ownership', name: '/src/components/ @frontend-team' }),
        expect.objectContaining({ kind: 'recent_commit', name: 'b'.repeat(40) }),
      ]),
    )
  })

  it('is repeatable regardless of provider file ordering', async () => {
    const first = await new RepositoryIndexer({ store: new MemoryRepositoryIndexStore() }).index(
      snapshot({}, fixtureFiles()),
    )
    const second = await new RepositoryIndexer({ store: new MemoryRepositoryIndexStore() }).index(
      snapshot({}, [...fixtureFiles()].reverse()),
    )
    expect(second.map).toEqual(first.map)
  })

  it('returns a bounded provenance manifest using deterministic lexical/symbol evidence', async () => {
    const store = new MemoryRepositoryIndexStore()
    await new RepositoryIndexer({ store }).index(snapshot())
    const request: RepositoryRetrievalRequestV1 = {
      schemaVersion: '1',
      context,
      repositoryId: 'fixture-repository',
      commit,
      configurationDigest,
      query: 'landing Hero component behavior',
      candidatePaths: ['src/components/Hero.tsx'],
      maximumTokens: 250,
    }
    const manifest = await new RepositoryRetriever({
      artifacts: new MockArtifactStore(),
      store,
    }).retrieve(request)
    expect(manifest.items[0]).toMatchObject({
      label: 'src/components/Hero.tsx',
      provenance: { commit, configurationDigest },
    })
    expect(manifest.totalEstimatedTokens).toBeLessThanOrEqual(request.maximumTokens)
    expect(manifest.items.every(({ provenance }) => provenance.commit === commit)).toBe(true)
    expect(manifest.items.map(({ label }) => label)).not.toContain('src/leaked-config.ts')
  })
})

describe('M05 index isolation and invalidation', () => {
  it('denies cross-tenant lookup and invalidates only stale indexes in the addressed project', async () => {
    const store = new MemoryRepositoryIndexStore()
    const indexer = new RepositoryIndexer({ store })
    await indexer.index(snapshot())
    await indexer.index(
      snapshot({
        context: { ...context, organizationId: '00000000-0000-4000-8000-000000000599' },
      }),
    )
    const nextCommit = 'c'.repeat(40)
    await indexer.index(snapshot({ commit: nextCommit }))

    const baseRequest = {
      schemaVersion: '1' as const,
      context,
      repositoryId: 'fixture-repository',
      configurationDigest,
      query: 'Hero',
      candidatePaths: [],
      maximumTokens: 100,
    }
    await expect(
      new RepositoryRetriever({ artifacts: new MockArtifactStore(), store }).retrieve({
        ...baseRequest,
        commit,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      new RepositoryRetriever({ artifacts: new MockArtifactStore(), store }).retrieve({
        ...baseRequest,
        context: { ...context, organizationId: '00000000-0000-4000-8000-000000000598' },
        commit: nextCommit,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(
      await store.find({
        ...baseRequest,
        context: { ...context, organizationId: '00000000-0000-4000-8000-000000000599' },
        commit,
      }),
    ).toBeDefined()
  })
})
