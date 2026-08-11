import { z } from 'zod'

import { opaqueIdSchema, schemaVersionV1 } from './common.js'
import { artifactReferenceV1Schema, providerRequestContextV1Schema } from './providers-v1.js'

const commitShaSchema = z.string().regex(/^[a-f0-9]{40}$/u)
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u)

export const repositoryProvenanceV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  repositoryId: z.string().min(1).max(256),
  commit: commitShaSchema,
  path: z.string().min(1).max(1024),
  digest: digestSchema,
  configurationDigest: digestSchema,
})

export const repositoryFileRecordV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  provenance: repositoryProvenanceV1Schema,
  sizeBytes: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
  language: z.string().min(1).max(80).optional(),
  category: z.enum(['source', 'test', 'configuration', 'documentation', 'asset']),
})

export const repositoryExclusionV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  path: z.string().min(1).max(1024),
  reason: z.enum(['generated', 'vendor', 'binary', 'large', 'secret', 'policy']),
  sizeBytes: z.number().int().nonnegative(),
})

export const repositoryEvidenceV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  kind: z.enum([
    'framework',
    'package_manager',
    'script',
    'route',
    'export',
    'import',
    'symbol',
    'component',
    'story',
    'test',
    'configuration',
    'instruction',
    'ownership',
    'recent_commit',
  ]),
  name: z.string().min(1).max(512),
  detail: z.string().max(2048).optional(),
  provenance: repositoryProvenanceV1Schema,
  estimatedTokens: z.number().int().nonnegative(),
})

export const repositoryMapV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  organizationId: opaqueIdSchema,
  projectId: opaqueIdSchema,
  repositoryId: z.string().min(1).max(256),
  commit: commitShaSchema,
  configurationDigest: digestSchema,
  mapDigest: digestSchema,
  files: z.array(repositoryFileRecordV1Schema),
  exclusions: z.array(repositoryExclusionV1Schema),
  evidence: z.array(repositoryEvidenceV1Schema),
})

export const repositoryRetrievalRequestV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  context: providerRequestContextV1Schema,
  repositoryId: z.string().min(1).max(256),
  commit: commitShaSchema,
  configurationDigest: digestSchema,
  query: z.string().min(1).max(2000),
  candidatePaths: z.array(z.string().min(1).max(1024)).max(100).default([]),
  maximumTokens: z.number().int().positive().max(100_000),
})

export const repositoryContextItemV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  id: opaqueIdSchema,
  kind: z.enum(['lexical', 'symbol', 'dependency', 'instruction', 'test']),
  label: z.string().min(1).max(512),
  provenance: repositoryProvenanceV1Schema,
  contentRef: artifactReferenceV1Schema,
  estimatedTokens: z.number().int().nonnegative(),
  relevanceScore: z.number().finite().nonnegative(),
})

export const repositoryRetrievalManifestV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  repositoryId: z.string().min(1).max(256),
  commit: commitShaSchema,
  configurationDigest: digestSchema,
  queryDigest: digestSchema,
  totalEstimatedTokens: z.number().int().nonnegative(),
  items: z.array(repositoryContextItemV1Schema),
})

export type RepositoryProvenanceV1 = z.infer<typeof repositoryProvenanceV1Schema>
export type RepositoryFileRecordV1 = z.infer<typeof repositoryFileRecordV1Schema>
export type RepositoryExclusionV1 = z.infer<typeof repositoryExclusionV1Schema>
export type RepositoryEvidenceV1 = z.infer<typeof repositoryEvidenceV1Schema>
export type RepositoryMapV1 = z.infer<typeof repositoryMapV1Schema>
export type RepositoryRetrievalRequestV1 = z.infer<typeof repositoryRetrievalRequestV1Schema>
export type RepositoryContextItemV1 = z.infer<typeof repositoryContextItemV1Schema>
export type RepositoryRetrievalManifestV1 = z.infer<typeof repositoryRetrievalManifestV1Schema>
