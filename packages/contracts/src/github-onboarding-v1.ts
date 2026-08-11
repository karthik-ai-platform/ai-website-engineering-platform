import { z } from 'zod'

import { isoTimestampSchema, opaqueIdSchema, schemaVersionV1 } from './common.js'
import { secretReferenceV1Schema } from './providers-v1.js'

export const githubRepositoryPermissionsV1Schema = z
  .object({
    metadata: z.literal('read'),
    contents: z.enum(['none', 'read']),
    pullRequests: z.enum(['none', 'read', 'write']),
  })
  .strict()

export const githubConnectionInitiationRequestV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  organizationId: opaqueIdSchema,
  projectId: opaqueIdSchema,
  returnUrl: z.url(),
})

export const githubConnectionInitiationResultV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  attemptId: opaqueIdSchema,
  authorizationUrl: z.url(),
  expiresAt: isoTimestampSchema,
})

export const githubInstallationSelectionV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  organizationId: opaqueIdSchema,
  projectId: opaqueIdSchema,
  attemptId: opaqueIdSchema,
  state: z.string().min(32).max(512),
  installationId: z.string().regex(/^\d+$/u),
  repositoryId: z.string().regex(/^\d+$/u),
})

export const githubRepositoryMetadataV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  installationId: z.string().regex(/^\d+$/u),
  repositoryId: z.string().regex(/^\d+$/u),
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  defaultBranch: z.string().min(1).max(255),
  indexedCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  permissions: githubRepositoryPermissionsV1Schema,
})

export const githubRepositoryConnectionV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  id: opaqueIdSchema,
  organizationId: opaqueIdSchema,
  projectId: opaqueIdSchema,
  provider: z.literal('github'),
  installationId: z.string().regex(/^\d+$/u),
  repositoryId: z.string().regex(/^\d+$/u),
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  permissions: githubRepositoryPermissionsV1Schema,
  defaultBranch: z.string().min(1).max(255),
  indexedCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  appCredentialRef: secretReferenceV1Schema,
  readiness: z.enum(['ready', 'insufficient_permissions', 'access_lost']),
  mutationEnabled: z.literal(false),
  metadata: z.object({
    framework: z.null(),
    packageManager: z.null(),
    buildCommand: z.null(),
    testCommand: z.null(),
    detectionStatus: z.literal('pending'),
  }),
  connectedAt: isoTimestampSchema,
  verifiedAt: isoTimestampSchema,
})

export const githubRepositoryReadinessV1Schema = githubRepositoryConnectionV1Schema.omit({
  appCredentialRef: true,
})

export type GithubConnectionInitiationRequestV1 = z.infer<
  typeof githubConnectionInitiationRequestV1Schema
>
export type GithubConnectionInitiationResultV1 = z.infer<
  typeof githubConnectionInitiationResultV1Schema
>
export type GithubInstallationSelectionV1 = z.infer<typeof githubInstallationSelectionV1Schema>
export type GithubRepositoryMetadataV1 = z.infer<typeof githubRepositoryMetadataV1Schema>
export type GithubRepositoryConnectionV1 = z.infer<typeof githubRepositoryConnectionV1Schema>
export type GithubRepositoryReadinessV1 = z.infer<typeof githubRepositoryReadinessV1Schema>
