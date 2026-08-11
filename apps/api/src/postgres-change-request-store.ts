import {
  changeRequestV1Schema,
  requirementSpecV1Schema,
  type ChangeRequestV1,
  type RequirementSpecV1,
} from '@platform/contracts'
import {
  auditEvents,
  changeRequests,
  projects,
  requirementSpecs,
  type PlatformDatabase,
} from '@platform/database'
import type { ChangeRequestAuditEvent, ChangeRequestStore } from '@platform/domain'
import { and, desc, eq } from 'drizzle-orm'

import { PostgresProjectStore } from './postgres-project-store.js'

export class PostgresChangeRequestStore implements ChangeRequestStore {
  readonly #projects: PostgresProjectStore

  constructor(private readonly database: PlatformDatabase) {
    this.#projects = new PostgresProjectStore(database)
  }

  findHumanMembership(organizationId: string, actorId: string) {
    return this.#projects.findHumanMembership(organizationId, actorId)
  }

  findServiceGrant(organizationId: string, actorId: string) {
    return this.#projects.findServiceGrant(organizationId, actorId)
  }

  async findProjectStatus(organizationId: string, projectId: string) {
    const [row] = await this.database
      .select({ status: projects.status })
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)))
      .limit(1)
    return row?.status
  }

  async findByIdempotencyKey(organizationId: string, projectId: string, idempotencyKey: string) {
    const [row] = await this.database
      .select()
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.organizationId, organizationId),
          eq(changeRequests.projectId, projectId),
          eq(changeRequests.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)
    return row === undefined ? undefined : this.parseChangeRequest(row)
  }

  async findChangeRequest(organizationId: string, projectId: string, changeRequestId: string) {
    const [row] = await this.database
      .select()
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.organizationId, organizationId),
          eq(changeRequests.projectId, projectId),
          eq(changeRequests.id, changeRequestId),
        ),
      )
      .limit(1)
    return row === undefined ? undefined : this.parseChangeRequest(row)
  }

  async findLatestRequirement(organizationId: string, projectId: string, changeRequestId: string) {
    const [row] = await this.database
      .select()
      .from(requirementSpecs)
      .where(
        and(
          eq(requirementSpecs.organizationId, organizationId),
          eq(requirementSpecs.projectId, projectId),
          eq(requirementSpecs.changeRequestId, changeRequestId),
        ),
      )
      .orderBy(desc(requirementSpecs.revision))
      .limit(1)
    return row === undefined ? undefined : requirementSpecV1Schema.parse(row.body)
  }

  async createChangeRequest(
    changeRequest: ChangeRequestV1,
    audit: ChangeRequestAuditEvent,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction.insert(changeRequests).values(this.changeRequestValues(changeRequest))
      await transaction.insert(auditEvents).values(this.auditValues(audit))
    })
  }

  async saveRequirement(
    changeRequest: ChangeRequestV1,
    requirement: RequirementSpecV1,
    audit: ChangeRequestAuditEvent,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction.insert(requirementSpecs).values({
        id: requirement.id,
        organizationId: changeRequest.organizationId,
        projectId: changeRequest.projectId,
        changeRequestId: changeRequest.id,
        schemaVersion: requirement.schemaVersion,
        revision: requirement.revision,
        body: requirement,
        assumptions: requirement.assumptions,
        createdAt: new Date(requirement.createdAt),
      })
      await transaction
        .update(changeRequests)
        .set({ status: changeRequest.status })
        .where(
          and(
            eq(changeRequests.organizationId, changeRequest.organizationId),
            eq(changeRequests.projectId, changeRequest.projectId),
            eq(changeRequests.id, changeRequest.id),
          ),
        )
      await transaction.insert(auditEvents).values(this.auditValues(audit))
    })
  }

  appendAuditEvent(event: ChangeRequestAuditEvent) {
    return this.#projects.appendAuditEvent(event)
  }

  private changeRequestValues(changeRequest: ChangeRequestV1) {
    return {
      id: changeRequest.id,
      organizationId: changeRequest.organizationId,
      projectId: changeRequest.projectId,
      actorId: changeRequest.actorId,
      actorType: changeRequest.actorType,
      idempotencyKey: changeRequest.idempotencyKey,
      originalPrompt: changeRequest.originalPrompt,
      mode: changeRequest.mode,
      target: changeRequest.target,
      constraints: changeRequest.constraints,
      attachments: changeRequest.attachments,
      status: changeRequest.status,
      createdAt: new Date(changeRequest.createdAt),
    }
  }

  private auditValues(event: ChangeRequestAuditEvent) {
    return {
      id: event.id,
      schemaVersion: event.schemaVersion,
      organizationId: event.organizationId,
      projectId: event.projectId,
      actorRef: event.actorRef,
      action: event.action,
      targetRef: event.targetRef,
      outcome: event.outcome,
      correlationId: event.correlationId,
      payloadRef: event.payloadRef ?? null,
      occurredAt: event.occurredAt,
    }
  }

  private parseChangeRequest(row: typeof changeRequests.$inferSelect) {
    return changeRequestV1Schema.parse({
      schemaVersion: '1',
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      actorId: row.actorId,
      actorType: row.actorType,
      idempotencyKey: row.idempotencyKey,
      originalPrompt: row.originalPrompt,
      mode: row.mode,
      target: row.target,
      constraints: row.constraints,
      attachments: row.attachments,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    })
  }
}
