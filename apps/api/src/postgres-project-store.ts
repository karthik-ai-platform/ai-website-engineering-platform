import type { ProjectV1 } from '@platform/contracts'
import {
  auditEvents,
  memberships,
  policyProfiles,
  projects,
  serviceIdentities,
  serviceIdentityPermissions,
  type PlatformDatabase,
} from '@platform/database'
import type {
  HumanMembership,
  ProjectAuditEvent,
  ProjectPolicyReference,
  ProjectStore,
  ServiceGrant,
} from '@platform/domain'
import { and, eq } from 'drizzle-orm'

export class PostgresProjectStore implements ProjectStore {
  constructor(private readonly database: PlatformDatabase) {}

  async findHumanMembership(
    organizationId: string,
    actorId: string,
  ): Promise<HumanMembership | undefined> {
    const [row] = await this.database
      .select()
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, actorId)))
      .limit(1)
    return row === undefined
      ? undefined
      : {
          actorId: row.userId,
          organizationId: row.organizationId,
          role: row.role as HumanMembership['role'],
          status: row.status as HumanMembership['status'],
        }
  }

  async findServiceGrant(
    organizationId: string,
    actorId: string,
  ): Promise<ServiceGrant | undefined> {
    const [identity] = await this.database
      .select()
      .from(serviceIdentities)
      .where(
        and(
          eq(serviceIdentities.organizationId, organizationId),
          eq(serviceIdentities.id, actorId),
        ),
      )
      .limit(1)
    if (identity === undefined) return undefined
    const grants = await this.database
      .select({ permission: serviceIdentityPermissions.permission })
      .from(serviceIdentityPermissions)
      .where(
        and(
          eq(serviceIdentityPermissions.organizationId, organizationId),
          eq(serviceIdentityPermissions.serviceIdentityId, actorId),
        ),
      )
    return {
      actorId: identity.id,
      organizationId: identity.organizationId,
      ...(identity.projectId === null ? {} : { projectId: identity.projectId }),
      permissions: grants.map(
        ({ permission }) => permission as ServiceGrant['permissions'][number],
      ),
      status: identity.status as ServiceGrant['status'],
    }
  }

  async findPolicy(
    organizationId: string,
    policyId: string,
  ): Promise<ProjectPolicyReference | undefined> {
    const [row] = await this.database
      .select()
      .from(policyProfiles)
      .where(
        and(eq(policyProfiles.organizationId, organizationId), eq(policyProfiles.id, policyId)),
      )
      .limit(1)
    return row === undefined
      ? undefined
      : {
          id: row.id,
          deletionRetentionDays: row.deletionRetentionDays,
          status: row.status as ProjectPolicyReference['status'],
        }
  }

  async findProject(organizationId: string, projectId: string): Promise<ProjectV1 | undefined> {
    const [row] = await this.database
      .select()
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)))
      .limit(1)
    if (row === undefined || row.policyId === null) return undefined
    return {
      schemaVersion: '1',
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      slug: row.slug,
      pluginType: 'website',
      policyId: row.policyId,
      status: row.status as ProjectV1['status'],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...(row.archivedAt === null ? {} : { archivedAt: row.archivedAt.toISOString() }),
      ...(row.deletionRequestedAt === null
        ? {}
        : { deletionRequestedAt: row.deletionRequestedAt.toISOString() }),
      ...(row.retentionUntil === null ? {} : { retentionUntil: row.retentionUntil.toISOString() }),
      ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt.toISOString() }),
    }
  }

  async createProject(project: ProjectV1, auditEvent: ProjectAuditEvent): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction.insert(projects).values(this.projectValues(project))
      await transaction.insert(auditEvents).values(this.auditValues(auditEvent))
    })
  }

  async updateProject(project: ProjectV1, auditEvent: ProjectAuditEvent): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const updated = await transaction
        .update(projects)
        .set(this.projectValues(project))
        .where(
          and(eq(projects.organizationId, project.organizationId), eq(projects.id, project.id)),
        )
        .returning({ id: projects.id })
      if (updated.length !== 1)
        throw new Error('Tenant-scoped project update did not affect exactly one record.')
      await transaction.insert(auditEvents).values(this.auditValues(auditEvent))
    })
  }

  async appendAuditEvent(event: ProjectAuditEvent): Promise<void> {
    await this.database.insert(auditEvents).values(this.auditValues(event))
  }

  private projectValues(project: ProjectV1) {
    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      status: project.status,
      pluginType: project.pluginType,
      policyId: project.policyId,
      createdAt: new Date(project.createdAt),
      updatedAt: new Date(project.updatedAt),
      archivedAt: project.archivedAt === undefined ? null : new Date(project.archivedAt),
      deletionRequestedAt:
        project.deletionRequestedAt === undefined ? null : new Date(project.deletionRequestedAt),
      retentionUntil:
        project.retentionUntil === undefined ? null : new Date(project.retentionUntil),
      deletedAt: project.deletedAt === undefined ? null : new Date(project.deletedAt),
    }
  }

  private auditValues(event: ProjectAuditEvent) {
    return {
      id: event.id,
      schemaVersion: event.schemaVersion,
      organizationId: event.organizationId,
      projectId: event.projectId ?? null,
      actorRef: event.actorRef,
      action: event.action,
      targetRef: event.targetRef,
      outcome: event.outcome,
      correlationId: event.correlationId,
      payloadRef: event.payloadRef ?? null,
      occurredAt: event.occurredAt,
    }
  }
}
