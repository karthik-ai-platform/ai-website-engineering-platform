import type {
  ProviderRequestContextV1,
  RepositoryMapV1,
  RepositoryRetrievalRequestV1,
} from '@platform/contracts'

export interface RepositorySnapshotFile {
  readonly path: string
  readonly content: Uint8Array
}

export interface RecentCommitContext {
  readonly commit: string
  readonly summary: string
}

export interface RepositorySnapshot {
  readonly context: ProviderRequestContextV1
  readonly repositoryId: string
  readonly commit: string
  readonly configurationDigest: string
  readonly files: readonly RepositorySnapshotFile[]
  readonly recentCommits?: readonly RecentCommitContext[]
}

export interface IndexedRepositoryDocument {
  readonly path: string
  readonly content: string
  readonly estimatedTokens: number
  readonly digest: string
  readonly evidenceKinds: readonly string[]
}

export interface IndexedRepository {
  readonly map: RepositoryMapV1
  readonly documents: readonly IndexedRepositoryDocument[]
}

export interface RepositoryIndexStore {
  save(index: IndexedRepository): Promise<void>
  find(request: RepositoryRetrievalRequestV1): Promise<IndexedRepository | undefined>
  invalidateProject(
    organizationId: string,
    projectId: string,
    keep: { readonly commit: string; readonly configurationDigest: string },
  ): Promise<number>
}

export interface SemanticRepositorySearchPort {
  search(request: RepositoryRetrievalRequestV1): Promise<readonly { path: string; score: number }[]>
}
