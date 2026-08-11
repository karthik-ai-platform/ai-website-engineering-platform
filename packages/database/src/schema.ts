import { sql } from 'drizzle-orm'
import {
  check,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Identifiers intentionally have no database defaults. The application must
 * create UUIDs before persistence so one identifier follows an operation
 * across API, workflow, audit, and provider boundaries.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    identityProviderId: text('identity_provider_id').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('users_identity_provider_id_unique').on(table.identityProviderId),
    check('users_status_check', sql`${table.status} in ('active', 'suspended', 'disabled')`),
  ],
)

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    policyProfileId: uuid('policy_profile_id'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('organizations_slug_unique').on(table.slug),
    check(
      'organizations_status_check',
      sql`${table.status} in ('active', 'suspended', 'archived')`,
    ),
  ],
)

export const memberships = pgTable(
  'memberships',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    role: text('role').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.userId],
      name: 'memberships_organization_id_user_id_pk',
    }),
    index('memberships_user_id_idx').on(table.userId),
    check(
      'memberships_role_check',
      sql`${table.role} in ('owner', 'developer', 'designer', 'reviewer', 'viewer')`,
    ),
    check('memberships_status_check', sql`${table.status} in ('active', 'suspended', 'revoked')`),
  ],
)

export const policyProfiles = pgTable(
  'policy_profiles',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    name: text('name').notNull(),
    deletionRetentionDays: integer('deletion_retention_days').notNull().default(30),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('policy_profiles_organization_id_id_unique').on(table.organizationId, table.id),
    unique('policy_profiles_organization_id_name_unique').on(table.organizationId, table.name),
    check(
      'policy_profiles_retention_days_check',
      sql`${table.deletionRetentionDays} BETWEEN 0 AND 3650`,
    ),
    check('policy_profiles_status_check', sql`${table.status} in ('active', 'retired')`),
  ],
)

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status').notNull().default('active'),
    pluginType: text('plugin_type').notNull().default('website'),
    policyId: uuid('policy_id'),
    archivedAt: timestamp('archived_at', { mode: 'date', withTimezone: true }),
    deletionRequestedAt: timestamp('deletion_requested_at', { mode: 'date', withTimezone: true }),
    retentionUntil: timestamp('retention_until', { mode: 'date', withTimezone: true }),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('projects_organization_id_slug_unique').on(table.organizationId, table.slug),
    unique('projects_organization_id_id_unique').on(table.organizationId, table.id),
    index('projects_organization_id_status_idx').on(table.organizationId, table.status),
    check(
      'projects_status_check',
      sql`${table.status} in ('active', 'archived', 'deletion_pending', 'deleted')`,
    ),
    foreignKey({
      columns: [table.organizationId, table.policyId],
      foreignColumns: [policyProfiles.organizationId, policyProfiles.id],
      name: 'projects_policy_tenant_fk',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
  ],
)

export const serviceIdentities = pgTable(
  'service_identities',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    projectId: uuid('project_id'),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('service_identities_organization_id_id_unique').on(table.organizationId, table.id),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'service_identities_project_tenant_fk',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check(
      'service_identities_status_check',
      sql`${table.status} in ('active', 'suspended', 'revoked')`,
    ),
  ],
)

export const serviceIdentityPermissions = pgTable(
  'service_identity_permissions',
  {
    organizationId: uuid('organization_id').notNull(),
    serviceIdentityId: uuid('service_identity_id').notNull(),
    permission: text('permission').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.serviceIdentityId, table.permission],
      name: 'service_identity_permissions_pk',
    }),
    foreignKey({
      columns: [table.organizationId, table.serviceIdentityId],
      foreignColumns: [serviceIdentities.organizationId, serviceIdentities.id],
      name: 'service_identity_permissions_identity_tenant_fk',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check(
      'service_identity_permissions_permission_check',
      sql`${table.permission} in (
      'project:read', 'project:create', 'project:archive', 'project:restore', 'project:delete',
      'change:request', 'change:approve', 'repository:connect', 'git:merge', 'release:promote', 'secret:manage',
      'policy:modify', 'member:manage'
    )`,
    ),
  ],
)

export const githubConnectionAttempts = pgTable(
  'github_connection_attempts',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    stateDigest: text('state_digest').notNull(),
    returnUrl: text('return_url').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'github_connection_attempts_project_tenant_fk',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('github_connection_attempts_project_id_idx').on(table.projectId, table.expiresAt),
    check('github_connection_attempts_state_digest_check', sql`length(${table.stateDigest}) = 64`),
  ],
)

export const repositoryConnections = pgTable(
  'repository_connections',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    provider: text('provider').notNull(),
    installationId: text('installation_id').notNull(),
    repositoryId: text('repository_id').notNull(),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    permissions: jsonb('permissions').notNull(),
    defaultBranch: text('default_branch').notNull(),
    indexedCommit: text('indexed_commit').notNull(),
    appCredentialRef: jsonb('app_credential_ref').notNull(),
    readiness: text('readiness').notNull(),
    mutationEnabled: boolean('mutation_enabled').notNull().default(false),
    metadata: jsonb('metadata').notNull(),
    connectedAt: timestamp('connected_at', { mode: 'date', withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { mode: 'date', withTimezone: true }).notNull(),
  },
  (table) => [
    unique('repository_connections_organization_project_unique').on(
      table.organizationId,
      table.projectId,
    ),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'repository_connections_project_tenant_fk',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check('repository_connections_provider_check', sql`${table.provider} = 'github'`),
    check(
      'repository_connections_readiness_check',
      sql`${table.readiness} in ('ready', 'insufficient_permissions', 'access_lost')`,
    ),
    check('repository_connections_mutation_disabled_check', sql`${table.mutationEnabled} = false`),
    check('repository_connections_commit_check', sql`length(${table.indexedCommit}) = 40`),
    check(
      'repository_connections_secret_reference_check',
      sql`jsonb_typeof(${table.appCredentialRef}) = 'object'
        AND ${table.appCredentialRef} ? 'provider'
        AND ${table.appCredentialRef} ? 'key'
        AND NOT (${table.appCredentialRef} ?| array['value', 'token', 'secret', 'privateKey'])`,
    ),
  ],
)

export const changeRequests = pgTable(
  'change_requests',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    actorType: text('actor_type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    originalPrompt: text('original_prompt').notNull(),
    mode: text('mode').notNull(),
    target: text('target').notNull(),
    constraints: jsonb('constraints').notNull(),
    attachments: jsonb('attachments').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
  },
  (table) => [
    unique('change_requests_organization_project_id_unique').on(
      table.organizationId,
      table.projectId,
      table.id,
    ),
    unique('change_requests_organization_project_idempotency_unique').on(
      table.organizationId,
      table.projectId,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'change_requests_project_tenant_fk',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('change_requests_project_created_at_idx').on(table.projectId, table.createdAt),
    check('change_requests_actor_type_check', sql`${table.actorType} in ('user', 'service')`),
    check(
      'change_requests_mode_check',
      sql`${table.mode} in ('builder', 'designer', 'refactor', 'debug', 'seo', 'performance', 'accessibility', 'content')`,
    ),
    check(
      'change_requests_target_check',
      sql`${table.target} in ('preview', 'staging', 'production')`,
    ),
    check(
      'change_requests_status_check',
      sql`${table.status} in ('intake_complete', 'requirements_pending', 'requirements_review', 'blocked')`,
    ),
    check('change_requests_prompt_check', sql`length(${table.originalPrompt}) between 1 and 20000`),
    check(
      'change_requests_json_shape_check',
      sql`jsonb_typeof(${table.constraints}) = 'array' AND jsonb_typeof(${table.attachments}) = 'array'`,
    ),
  ],
)

export const requirementSpecs = pgTable(
  'requirement_specs',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    changeRequestId: uuid('change_request_id').notNull(),
    schemaVersion: text('schema_version').notNull(),
    revision: integer('revision').notNull(),
    body: jsonb('body').notNull(),
    assumptions: jsonb('assumptions').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
  },
  (table) => [
    unique('requirement_specs_change_request_revision_unique').on(
      table.changeRequestId,
      table.revision,
    ),
    foreignKey({
      columns: [table.organizationId, table.projectId, table.changeRequestId],
      foreignColumns: [changeRequests.organizationId, changeRequests.projectId, changeRequests.id],
      name: 'requirement_specs_change_request_tenant_fk',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('requirement_specs_change_request_revision_idx').on(
      table.changeRequestId,
      table.revision,
    ),
    check('requirement_specs_schema_version_check', sql`${table.schemaVersion} = '1'`),
    check('requirement_specs_revision_check', sql`${table.revision} > 0`),
    check(
      'requirement_specs_json_shape_check',
      sql`jsonb_typeof(${table.body}) = 'object' AND jsonb_typeof(${table.assumptions}) = 'array'`,
    ),
  ],
)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    schemaVersion: text('schema_version').notNull().default('1'),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    projectId: uuid('project_id'),
    actorRef: text('actor_ref').notNull(),
    action: text('action').notNull(),
    targetRef: text('target_ref').notNull(),
    outcome: text('outcome').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    payloadRef: text('payload_ref'),
    occurredAt: timestamp('occurred_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'audit_events_project_tenant_fk',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('audit_events_organization_id_occurred_at_idx').on(
      table.organizationId,
      table.occurredAt,
    ),
    index('audit_events_project_id_occurred_at_idx').on(table.projectId, table.occurredAt),
    index('audit_events_correlation_id_idx').on(table.correlationId),
  ],
)

export type UserRow = typeof users.$inferSelect
export type NewUserRow = typeof users.$inferInsert
export type OrganizationRow = typeof organizations.$inferSelect
export type NewOrganizationRow = typeof organizations.$inferInsert
export type MembershipRow = typeof memberships.$inferSelect
export type NewMembershipRow = typeof memberships.$inferInsert
export type ProjectRow = typeof projects.$inferSelect
export type NewProjectRow = typeof projects.$inferInsert
export type AuditEventRow = typeof auditEvents.$inferSelect
export type NewAuditEventRow = typeof auditEvents.$inferInsert
export type PolicyProfileRow = typeof policyProfiles.$inferSelect
export type ServiceIdentityRow = typeof serviceIdentities.$inferSelect
export type ServiceIdentityPermissionRow = typeof serviceIdentityPermissions.$inferSelect
export type GithubConnectionAttemptRow = typeof githubConnectionAttempts.$inferSelect
export type RepositoryConnectionRow = typeof repositoryConnections.$inferSelect
export type ChangeRequestRow = typeof changeRequests.$inferSelect
export type RequirementSpecRow = typeof requirementSpecs.$inferSelect
