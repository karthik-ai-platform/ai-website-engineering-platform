import type { RepositoryRetrievalRequestV1 } from '@platform/contracts'

import type { IndexedRepository, RepositoryIndexStore } from './types.js'

export class MemoryRepositoryIndexStore implements RepositoryIndexStore {
  readonly #indexes = new Map<string, IndexedRepository>()

  save(index: IndexedRepository): Promise<void> {
    this.#indexes.set(key(index.map), index)
    return Promise.resolve()
  }

  find(request: RepositoryRetrievalRequestV1): Promise<IndexedRepository | undefined> {
    return Promise.resolve(
      this.#indexes.get(
        key({
          organizationId: request.context.organizationId,
          projectId: request.context.projectId,
          repositoryId: request.repositoryId,
          commit: request.commit,
          configurationDigest: request.configurationDigest,
        }),
      ),
    )
  }

  invalidateProject(
    organizationId: string,
    projectId: string,
    keep: { readonly commit: string; readonly configurationDigest: string },
  ): Promise<number> {
    let removed = 0
    for (const [cacheKey, index] of this.#indexes) {
      if (
        index.map.organizationId === organizationId &&
        index.map.projectId === projectId &&
        (index.map.commit !== keep.commit ||
          index.map.configurationDigest !== keep.configurationDigest)
      ) {
        this.#indexes.delete(cacheKey)
        removed += 1
      }
    }
    return Promise.resolve(removed)
  }
}

function key(scope: {
  readonly organizationId: string
  readonly projectId: string
  readonly repositoryId: string
  readonly commit: string
  readonly configurationDigest: string
}) {
  return [
    scope.organizationId,
    scope.projectId,
    scope.repositoryId,
    scope.commit,
    scope.configurationDigest,
  ].join(':')
}
