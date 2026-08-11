import { createHash } from 'node:crypto'

import {
  repositoryRetrievalManifestV1Schema,
  repositoryRetrievalRequestV1Schema,
  type RepositoryContextItemV1,
  type RepositoryRetrievalManifestV1,
  type RepositoryRetrievalRequestV1,
} from '@platform/contracts'
import { PlatformError, type ArtifactStorePort } from '@platform/domain'

import type {
  IndexedRepositoryDocument,
  RepositoryIndexStore,
  SemanticRepositorySearchPort,
} from './types.js'

export interface RepositoryRetrieverOptions {
  readonly artifacts: ArtifactStorePort
  readonly semanticSearch?: SemanticRepositorySearchPort
  readonly store: RepositoryIndexStore
}

export class RepositoryRetriever {
  readonly #artifacts: ArtifactStorePort
  readonly #semanticSearch: SemanticRepositorySearchPort | undefined
  readonly #store: RepositoryIndexStore

  constructor(options: RepositoryRetrieverOptions) {
    this.#artifacts = options.artifacts
    this.#semanticSearch = options.semanticSearch
    this.#store = options.store
  }

  async retrieve(input: RepositoryRetrievalRequestV1): Promise<RepositoryRetrievalManifestV1> {
    const request = repositoryRetrievalRequestV1Schema.parse(input)
    const index = await this.#store.find(request)
    if (index === undefined) {
      throw new PlatformError({
        code: 'NOT_FOUND',
        correlationId: request.context.correlationId,
        retryable: false,
        safeMessage: 'The requested commit-addressed repository index was not found.',
      })
    }

    const queryTerms = tokenize(request.query)
    const candidatePaths = new Set(request.candidatePaths)
    const semantic = new Map(
      (await this.#semanticSearch?.search(request))?.map(({ path, score }) => [path, score]) ?? [],
    )
    const ranked = index.documents
      .map((document) => ({
        document,
        score:
          lexicalScore(document, queryTerms, candidatePaths) + (semantic.get(document.path) ?? 0),
      }))
      .filter(({ score }) => score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.document.path.localeCompare(right.document.path),
      )

    const items: RepositoryContextItemV1[] = []
    let remaining = request.maximumTokens
    for (const { document, score } of ranked) {
      if (remaining <= 0) break
      const excerpt = boundedExcerpt(document.content, queryTerms, remaining)
      const estimatedTokens = estimateTokens(excerpt)
      if (estimatedTokens === 0 || estimatedTokens > remaining) continue
      const contentRef = await this.#artifacts.put(
        request.context,
        new TextEncoder().encode(excerpt),
        { mediaType: 'text/plain; charset=utf-8', retentionClass: 'repository-context' },
      )
      items.push({
        schemaVersion: '1',
        id: deterministicId(`${request.commit}:${document.path}:${contentRef.digest}`),
        kind: itemKind(document),
        label: document.path,
        provenance: {
          schemaVersion: '1',
          repositoryId: request.repositoryId,
          commit: request.commit,
          path: document.path,
          digest: document.digest,
          configurationDigest: request.configurationDigest,
        },
        contentRef,
        estimatedTokens,
        relevanceScore: score,
      })
      remaining -= estimatedTokens
    }

    return repositoryRetrievalManifestV1Schema.parse({
      schemaVersion: '1',
      repositoryId: request.repositoryId,
      commit: request.commit,
      configurationDigest: request.configurationDigest,
      queryDigest: sha256(request.query),
      totalEstimatedTokens: items.reduce((total, item) => total + item.estimatedTokens, 0),
      items,
    })
  }
}

function lexicalScore(
  document: IndexedRepositoryDocument,
  queryTerms: readonly string[],
  candidatePaths: ReadonlySet<string>,
): number {
  const path = document.path.toLowerCase()
  const content = document.content.toLowerCase()
  let score = candidatePaths.has(document.path) ? 25 : 0
  for (const term of queryTerms) {
    if (path.includes(term)) score += 10
    if (content.includes(term)) score += 2
  }
  if (document.evidenceKinds.includes('instruction')) score += 3
  if (document.evidenceKinds.includes('test')) score += 2
  return score
}

function boundedExcerpt(
  content: string,
  queryTerms: readonly string[],
  maximumTokens: number,
): string {
  const maximumCharacters = Math.min(maximumTokens * 4, 4000)
  if (content.length <= maximumCharacters) return content
  const lower = content.toLowerCase()
  const position = queryTerms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]
  const start = Math.max(0, (position ?? 0) - Math.floor(maximumCharacters / 4))
  return content.slice(start, start + maximumCharacters)
}

function itemKind(document: IndexedRepositoryDocument): RepositoryContextItemV1['kind'] {
  if (document.evidenceKinds.includes('instruction')) return 'instruction'
  if (document.evidenceKinds.includes('test')) return 'test'
  if (document.evidenceKinds.includes('symbol') || document.evidenceKinds.includes('component')) {
    return 'symbol'
  }
  if (document.evidenceKinds.includes('import')) return 'dependency'
  return 'lexical'
}

function tokenize(value: string): readonly string[] {
  return [...new Set(value.toLowerCase().match(/[a-z0-9_$-]{2,}/gu) ?? [])].sort()
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4)
}

function deterministicId(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
