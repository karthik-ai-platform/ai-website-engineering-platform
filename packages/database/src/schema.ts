import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
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
      'change:request', 'change:approve', 'git:merge', 'release:promote', 'secret:manage',
      'policy:modify', 'member:manage'
    )`,
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
