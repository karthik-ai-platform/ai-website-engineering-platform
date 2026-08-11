import { createHash } from 'node:crypto'
import { extname, posix } from 'node:path'

import {
  repositoryMapV1Schema,
  type RepositoryEvidenceV1,
  type RepositoryExclusionV1,
  type RepositoryFileRecordV1,
  type RepositoryProvenanceV1,
} from '@platform/contracts'

import type {
  IndexedRepository,
  IndexedRepositoryDocument,
  RepositoryIndexStore,
  RepositorySnapshot,
} from './types.js'

const generatedSegments = new Set(['.next', '.turbo', 'build', 'coverage', 'dist', 'out'])
const vendorSegments = new Set(['node_modules', 'vendor'])
const binaryExtensions = new Set([
  '.7z',
  '.avif',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.tar',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
])
const secretNames =
  /^(?:\.env(?:\..+)?|\.(?:netrc|npmrc|pypirc)|credentials(?:\..+)?|secrets?(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519)|.+\.(?:key|pem|p12|pfx))$/iu
const secretContent =
  /(?:-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----|\b(?:gh[oprsu]_|github_pat_|sk-)[A-Za-z0-9_-]{20,}|(?:api[_-]?key|client[_-]?secret|password|token)\s*[:=]\s*["']?[^\s,"']{12,})/iu

export interface RepositoryIndexerOptions {
  readonly maximumFileBytes?: number
  readonly store: RepositoryIndexStore
}

export class RepositoryIndexer {
  readonly #maximumFileBytes: number
  readonly #store: RepositoryIndexStore

  constructor(options: RepositoryIndexerOptions) {
    this.#maximumFileBytes = options.maximumFileBytes ?? 1_000_000
    this.#store = options.store
  }

  async index(snapshot: RepositorySnapshot): Promise<IndexedRepository> {
    if (!/^[a-f0-9]{40}$/u.test(snapshot.commit))
      throw new Error('Commit must be immutable SHA-1 form.')
    if (!/^[a-f0-9]{64}$/u.test(snapshot.configurationDigest)) {
      throw new Error('Configuration digest must be SHA-256 form.')
    }

    const files: RepositoryFileRecordV1[] = []
    const exclusions: RepositoryExclusionV1[] = []
    const evidence: RepositoryEvidenceV1[] = []
    const documents: IndexedRepositoryDocument[] = []
    const sorted = [...snapshot.files].sort((left, right) => left.path.localeCompare(right.path))
    const seenPaths = new Set<string>()

    for (const file of sorted) {
      const path = normalizePath(file.path)
      if (seenPaths.has(path)) throw new Error(`Duplicate repository path: ${path}`)
      seenPaths.add(path)
      const excluded = exclusionReason(path, file.content, this.#maximumFileBytes)
      if (excluded !== undefined) {
        exclusions.push({
          schemaVersion: '1',
          path,
          reason: excluded,
          sizeBytes: file.content.byteLength,
        })
        continue
      }
      let content: string
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(file.content)
      } catch {
        exclusions.push({
          schemaVersion: '1',
          path,
          reason: 'binary',
          sizeBytes: file.content.byteLength,
        })
        continue
      }
      if (secretContent.test(content)) {
        exclusions.push({
          schemaVersion: '1',
          path,
          reason: 'secret',
          sizeBytes: file.content.byteLength,
        })
        continue
      }
      const digest = sha256(file.content)
      const provenance = this.provenance(snapshot, path, digest)
      const estimatedTokens = estimateTokens(content)
      const record: RepositoryFileRecordV1 = {
        schemaVersion: '1',
        provenance,
        sizeBytes: file.content.byteLength,
        estimatedTokens,
        ...(language(path) === undefined ? {} : { language: language(path) }),
        category: category(path),
      }
      const fileEvidence = extractEvidence(path, content, provenance)
      files.push(record)
      evidence.push(...fileEvidence)
      documents.push({
        path,
        content,
        estimatedTokens,
        digest,
        evidenceKinds: [...new Set(fileEvidence.map(({ kind }) => kind))].sort(),
      })
    }

    evidence.push(...recentCommitEvidence(snapshot))
    const normalizedEvidence = evidence.sort(compareEvidence)
    const normalizedExclusions = exclusions.sort((left, right) =>
      left.path.localeCompare(right.path),
    )
    const mapDigest = sha256(
      new TextEncoder().encode(
        JSON.stringify({ files, exclusions: normalizedExclusions, evidence: normalizedEvidence }),
      ),
    )
    const map = repositoryMapV1Schema.parse({
      schemaVersion: '1',
      organizationId: snapshot.context.organizationId,
      projectId: snapshot.context.projectId,
      repositoryId: snapshot.repositoryId,
      commit: snapshot.commit,
      configurationDigest: snapshot.configurationDigest,
      mapDigest,
      files,
      exclusions: normalizedExclusions,
      evidence: normalizedEvidence,
    })
    const indexed = { map, documents } satisfies IndexedRepository
    await this.#store.save(indexed)
    await this.#store.invalidateProject(map.organizationId, map.projectId, {
      commit: map.commit,
      configurationDigest: map.configurationDigest,
    })
    return indexed
  }

  private provenance(
    snapshot: RepositorySnapshot,
    path: string,
    digest: string,
  ): RepositoryProvenanceV1 {
    return {
      schemaVersion: '1',
      repositoryId: snapshot.repositoryId,
      commit: snapshot.commit,
      path,
      digest,
      configurationDigest: snapshot.configurationDigest,
    }
  }
}

function normalizePath(value: string): string {
  const normalized = posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//u, '')
  if (
    normalized.length === 0 ||
    normalized.startsWith('../') ||
    normalized.startsWith('/') ||
    normalized.includes('\u0000')
  ) {
    throw new Error('Repository path is unsafe.')
  }
  return normalized
}

function exclusionReason(
  path: string,
  content: Uint8Array,
  maximumFileBytes: number,
): RepositoryExclusionV1['reason'] | undefined {
  const segments = path.toLowerCase().split('/')
  if (segments.some((segment) => generatedSegments.has(segment))) return 'generated'
  if (segments.some((segment) => vendorSegments.has(segment))) return 'vendor'
  if (segments[0] === '.git') return 'policy'
  if (secretNames.test(segments.at(-1) ?? '')) return 'secret'
  if (content.byteLength > maximumFileBytes) return 'large'
  if (binaryExtensions.has(extname(path).toLowerCase()) || content.includes(0)) return 'binary'
  return undefined
}

function extractEvidence(
  path: string,
  content: string,
  provenance: RepositoryProvenanceV1,
): RepositoryEvidenceV1[] {
  const evidence: RepositoryEvidenceV1[] = []
  const add = (kind: RepositoryEvidenceV1['kind'], name: string, detail?: string) =>
    evidence.push({
      schemaVersion: '1',
      kind,
      name,
      ...(detail === undefined ? {} : { detail }),
      provenance,
      estimatedTokens: estimateTokens(`${name} ${detail ?? ''}`),
    })
  const base = posix.basename(path)
  if (/^(?:AGENTS|ARCHITECTURE|CONTRIBUTING|README)\.md$/iu.test(base)) add('instruction', path)
  if (/^(?:package|tsconfig|next\.config|vite\.config|vitest\.config|eslint\.config)/u.test(base)) {
    add('configuration', path)
  }
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path)) add('test', path)
  if (/\.stories\.[cm]?[jt]sx?$/u.test(path)) add('story', path)
  if (/\.[jt]sx$/u.test(path)) {
    for (const match of content.matchAll(/\b(?:function|class|const)\s+([A-Za-z_$][\w$]*)/gu)) {
      const name = match[1]
      if (name !== undefined) {
        add(/^[A-Z]/u.test(name) && /\.tsx$/u.test(path) ? 'component' : 'symbol', name)
      }
    }
    for (const match of content.matchAll(
      /\bfrom\s+["']([^"']+)["']|\bimport\s*["']([^"']+)["']/gu,
    )) {
      const imported = match[1] ?? match[2]
      if (imported !== undefined) add('import', imported)
    }
    for (const match of content.matchAll(
      /\bexport\s+(?:default\s+)?(?:function|class|const|type|interface)?\s*([A-Za-z_$][\w$]*)?/gu,
    )) {
      add('export', match[1] ?? 'default')
    }
  }
  const route = nextRoute(path)
  if (route !== undefined) add('route', route)
  if (base === 'package-lock.json') add('package_manager', 'npm')
  if (base === 'pnpm-lock.yaml') add('package_manager', 'pnpm')
  if (base === 'yarn.lock') add('package_manager', 'yarn')
  if (base === 'package.json') extractPackageEvidence(content, add)
  if (path === '.github/CODEOWNERS' || base === 'CODEOWNERS') {
    for (const line of content.split(/\r?\n/u)) {
      const clean = line.trim()
      if (clean.length > 0 && !clean.startsWith('#')) add('ownership', clean)
    }
  }
  return evidence
}

function extractPackageEvidence(
  content: string,
  add: (kind: RepositoryEvidenceV1['kind'], name: string, detail?: string) => void,
): void {
  try {
    const parsed = JSON.parse(content) as {
      scripts?: Record<string, unknown>
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
    }
    for (const [name, command] of Object.entries(parsed.scripts ?? {}).sort()) {
      if (typeof command === 'string') add('script', name, command)
    }
    const dependencies = { ...parsed.dependencies, ...parsed.devDependencies }
    for (const framework of ['next', 'react', 'vue', 'svelte', 'astro']) {
      if (framework in dependencies) add('framework', framework, String(dependencies[framework]))
    }
  } catch {
    // Invalid configuration remains a file record but does not become trusted metadata.
  }
}

function recentCommitEvidence(snapshot: RepositorySnapshot): RepositoryEvidenceV1[] {
  return [...(snapshot.recentCommits ?? [])]
    .filter(({ commit }) => /^[a-f0-9]{40}$/u.test(commit))
    .sort((left, right) => left.commit.localeCompare(right.commit))
    .map(({ commit, summary }) => {
      const digest = sha256(new TextEncoder().encode(summary))
      return {
        schemaVersion: '1',
        kind: 'recent_commit',
        name: commit,
        detail: summary.slice(0, 2048),
        provenance: {
          schemaVersion: '1',
          repositoryId: snapshot.repositoryId,
          commit: snapshot.commit,
          path: `.git/history/${commit}`,
          digest,
          configurationDigest: snapshot.configurationDigest,
        },
        estimatedTokens: estimateTokens(summary),
      }
    })
}

function nextRoute(path: string): string | undefined {
  if (/(?:^|\/)app\/page\.[jt]sx?$/u.test(path)) return '/'
  const app = path.match(/(?:^|\/)app\/(.+)\/page\.[jt]sx?$/u)
  const page = path.match(/(?:^|\/)pages\/(.+)\.[jt]sx?$/u)
  const value = app?.[1] ?? page?.[1]
  if (value === undefined) return undefined
  const clean = value.replace(/\/(?:index)$/u, '').replace(/\([^/]+\)\//gu, '')
  return `/${clean === 'index' ? '' : clean}`.replace(/\/+/gu, '/')
}

function language(path: string): string | undefined {
  return {
    '.css': 'CSS',
    '.html': 'HTML',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript React',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.sql': 'SQL',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript React',
    '.yaml': 'YAML',
    '.yml': 'YAML',
  }[extname(path).toLowerCase()]
}

function category(path: string): RepositoryFileRecordV1['category'] {
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path)) return 'test'
  if (/\.(?:md|mdx|txt)$/u.test(path)) return 'documentation'
  if (
    /^(?:package|tsconfig)|\.(?:json|ya?ml|toml|config\.[cm]?[jt]s)$/u.test(posix.basename(path))
  ) {
    return 'configuration'
  }
  if (/\.(?:css|html|[cm]?[jt]sx?)$/u.test(path)) return 'source'
  return 'asset'
}

function compareEvidence(left: RepositoryEvidenceV1, right: RepositoryEvidenceV1): number {
  return `${left.provenance.path}:${left.kind}:${left.name}`.localeCompare(
    `${right.provenance.path}:${right.kind}:${right.name}`,
  )
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4)
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
