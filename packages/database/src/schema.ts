import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
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
