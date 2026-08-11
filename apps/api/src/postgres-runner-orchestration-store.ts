import {
  runnerExecutionResultV1Schema,
  runnerIsolationProfileV1Schema,
  runnerLifecycleResultV1Schema,
  runnerWorkspaceV1Schema,
  runV1Schema,
  type RunnerExecutionResultV1,
} from '@platform/contracts'
import {
  auditEvents,
  repositoryConnections,
  runnerArtifacts,
  runnerCommands,
  runnerLifecycleRecords,
  runnerWorkspaces,
  runs,
  type PlatformDatabase,
} from '@platform/database'
import type {
  RunnerAuditEvent,
  RunnerOrchestrationStore,
  RunnerWorkspaceContext,
} from '@platform/domain'
import { and, eq } from 'drizzle-orm'

import { PostgresPlanningStore } from './postgres-planning-store.js'
import { PostgresProjectStore } from './postgres-project-store.js'

export class PostgresRunnerOrchestrationStore implements RunnerOrchestrationStore {
  readonly #planning: PostgresPlanningStore
  readonly #projects: PostgresProjectStore

  constructor(private readonly database: PlatformDatabase) {
    this.#planning = new PostgresPlanningStore(database)
    this.#projects = new PostgresProjectStore(database)
  }

  findServiceGrant(organizationId: string, actorId: string) {
    return this.#projects.findServiceGrant(organizationId, actorId)
  }

  async findPreparationContext(
    organizationId: string,
    projectId: string,
    runId: string,
    executionPlanId: string,
  ) {
    const [planning, currentPolicyVersion, repository] = await Promise.all([
      this.#planning.findPlanningResult(organizationId, projectId, runId, executionPlanId),
      this.#planning.findCurrentPolicyVersion(organizationId, projectId),
      this.database
        .select({
          provider: repositoryConnections.provider,
          repositoryId: repositoryConnections.repositoryId,
          indexedCommit: repositoryConnections.indexedCommit,
          readiness: repositoryConnections.readiness,
        })
        .from(repositoryConnections)
        .where(
          and(
            eq(repositoryConnections.organizationId, organizationId),
            eq(repositoryConnections.projectId, projectId),
          ),
        )
        .limit(1),
    ])
    const repositoryRow = repository[0]
    if (
      planning === undefined ||
      currentPolicyVersion === undefined ||
      repositoryRow === undefined
    ) {
      return undefined
    }
    return {
      planning,
      currentPolicyVersion,
      repository: {
        ...repositoryRow,
        readiness: repositoryRow.readiness as 'ready' | 'insufficient_permissions' | 'access_lost',
      },
    }
  }

  async findWorkspaceByIdempotencyKey(
    organizationId: string,
    projectId: string,
    idempotencyKey: string,
  ) {
    const [row] = await this.database
      .select()
      .from(runnerWorkspaces)
      .where(
        and(
          eq(runnerWorkspaces.organizationId, organizationId),
          eq(runnerWorkspaces.projectId, projectId),
          eq(runnerWorkspaces.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)
    return row === undefined ? undefined : workspaceRecord(row)
  }

  async findWorkspaceContext(
    organizationId: string,
    projectId: string,
    workspaceId: string,
    runId: string,
  ): Promise<RunnerWorkspaceContext | undefined> {
    const [row] = await this.database
      .select({ workspace: runnerWorkspaces, run: runs })
      .from(runnerWorkspaces)
      .innerJoin(
        runs,
        and(
          eq(runs.organizationId, runnerWorkspaces.organizationId),
          eq(runs.projectId, runnerWorkspaces.projectId),
          eq(runs.id, runnerWorkspaces.runId),
        ),
      )
      .where(
        and(
          eq(runnerWorkspaces.organizationId, organizationId),
          eq(runnerWorkspaces.projectId, projectId),
          eq(runnerWorkspaces.id, workspaceId),
          eq(runnerWorkspaces.runId, runId),
        ),
      )
      .limit(1)
    if (row === undefined) return undefined
    return { ...workspaceRecord(row.workspace), run: parseRun(row.run) }
  }

  async savePreparedWorkspace(
    input: Parameters<RunnerOrchestrationStore['savePreparedWorkspace']>[0],
  ) {
    await this.database.transaction(async (transaction) => {
      const updated = await transaction
        .update(runs)
        .set({ state: input.run.state, startedAt: new Date(input.run.startedAt!) })
        .where(
          and(
            eq(runs.organizationId, input.run.organizationId),
            eq(runs.projectId, input.run.projectId),
            eq(runs.id, input.run.id),
            eq(runs.state, 'QUEUED'),
          ),
        )
        .returning({ id: runs.id })
      if (updated.length !== 1) throw new Error('Queued runner transition lost its tenant scope.')
      await transaction.insert(runnerWorkspaces).values({
        id: input.workspace.id,
        organizationId: input.workspace.organizationId,
        projectId: input.workspace.projectId,
        runId: input.workspace.runId,
        executionPlanId: input.workspace.executionPlanId,
        idempotencyKey: input.idempotencyKey,
        requestDigest: input.requestDigest,
        baseCommit: input.workspace.baseCommit,
        profileDigest: input.workspace.profileDigest,
        backendClass: input.workspace.backendClass,
        profile: input.profile,
        checkoutEvidence: input.workspace.checkoutEvidence,
        state: input.workspace.state,
        createdAt: new Date(input.workspace.createdAt),
        expiresAt: new Date(input.workspace.expiresAt),
      })
      await insertAudit(transaction, input.auditEvents)
    })
  }

  async findCommandByIdempotencyKey(
    organizationId: string,
    projectId: string,
    idempotencyKey: string,
  ) {
    const [row] = await this.database
      .select()
      .from(runnerCommands)
      .where(
        and(
          eq(runnerCommands.organizationId, organizationId),
          eq(runnerCommands.projectId, projectId),
          eq(runnerCommands.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)
    if (row === undefined) return undefined
    const artifacts = await this.database
      .select()
      .from(runnerArtifacts)
      .where(
        and(
          eq(runnerArtifacts.organizationId, organizationId),
          eq(runnerArtifacts.projectId, projectId),
          eq(runnerArtifacts.commandId, row.id),
        ),
      )
    return { requestDigest: row.requestDigest, result: commandResult(row, artifacts) }
  }

  async saveExecution(input: Parameters<RunnerOrchestrationStore['saveExecution']>[0]) {
    await this.database.transaction(async (transaction) => {
      const updated = await transaction
        .update(runs)
        .set({
          state: input.run.state,
          endedAt: input.run.endedAt === undefined ? null : new Date(input.run.endedAt),
        })
        .where(
          and(
            eq(runs.organizationId, input.run.organizationId),
            eq(runs.projectId, input.run.projectId),
            eq(runs.id, input.run.id),
          ),
        )
        .returning({ id: runs.id })
      if (updated.length !== 1) throw new Error('Runner execution lost its tenant-scoped run.')
      await transaction.insert(runnerCommands).values({
        id: input.command.id,
        organizationId: input.command.context.organizationId,
        projectId: input.command.context.projectId,
        runId: input.command.runId,
        workspaceId: input.command.workspaceId,
        idempotencyKey: input.idempotencyKey,
        requestDigest: input.requestDigest,
        baseCommit: input.result.baseCommit,
        profileDigest: input.result.profileDigest,
        tool: input.command.tool,
        executable: input.command.executable,
        workingDirectory: input.command.workingDirectory,
        timeoutMs: input.command.timeoutMs,
        executionKind: input.result.executionKind,
        status: input.result.status,
        exitCode: input.result.exitCode ?? null,
        rejectionCode: input.result.rejectionCode ?? null,
        stdoutRef: input.result.stdoutRef ?? null,
        stderrRef: input.result.stderrRef ?? null,
        startedAt: new Date(input.result.startedAt),
        completedAt: new Date(input.result.completedAt),
      })
      if (input.result.artifacts.length > 0) {
        await transaction.insert(runnerArtifacts).values(
          input.result.artifacts.map((artifact) => ({
            organizationId: input.command.context.organizationId,
            projectId: input.command.context.projectId,
            runId: input.command.runId,
            workspaceId: input.command.workspaceId,
            commandId: input.command.id,
            path: artifact.path,
            reference: artifact.reference,
            digest: artifact.reference.digest,
            mediaType: artifact.reference.mediaType,
            retentionClass: artifact.reference.retentionClass,
            sizeBytes: artifact.sizeBytes,
          })),
        )
      }
      await insertAudit(transaction, input.auditEvents)
    })
  }

  async findLifecycleByIdempotencyKey(
    organizationId: string,
    projectId: string,
    idempotencyKey: string,
    action: 'cancel' | 'cleanup',
  ) {
    const [row] = await this.database
      .select()
      .from(runnerLifecycleRecords)
      .where(
        and(
          eq(runnerLifecycleRecords.organizationId, organizationId),
          eq(runnerLifecycleRecords.projectId, projectId),
          eq(runnerLifecycleRecords.idempotencyKey, idempotencyKey),
          eq(runnerLifecycleRecords.action, action),
        ),
      )
      .limit(1)
    return row === undefined
      ? undefined
      : {
          requestDigest: row.requestDigest,
          result: runnerLifecycleResultV1Schema.parse({
            schemaVersion: '1',
            workspaceId: row.workspaceId,
            runId: row.runId,
            status: row.resultStatus,
            occurredAt: row.occurredAt.toISOString(),
          }),
        }
  }

  async saveLifecycle(input: Parameters<RunnerOrchestrationStore['saveLifecycle']>[0]) {
    await this.database.transaction(async (transaction) => {
      await transaction.insert(runnerLifecycleRecords).values({
        id: input.id,
        organizationId: input.organizationId,
        projectId: input.projectId,
        runId: input.runId,
        workspaceId: input.workspaceId,
        action: input.action,
        idempotencyKey: input.idempotencyKey,
        requestDigest: input.requestDigest,
        resultStatus: input.result.status,
        occurredAt: new Date(input.result.occurredAt),
      })
      const workspaceState = input.action === 'cleanup' ? 'destroyed' : 'cancelled'
      const workspaceUpdated = await transaction
        .update(runnerWorkspaces)
        .set({ state: workspaceState })
        .where(
          and(
            eq(runnerWorkspaces.organizationId, input.organizationId),
            eq(runnerWorkspaces.projectId, input.projectId),
            eq(runnerWorkspaces.id, input.workspaceId),
            eq(runnerWorkspaces.runId, input.runId),
          ),
        )
        .returning({ id: runnerWorkspaces.id })
      if (workspaceUpdated.length !== 1) {
        throw new Error('Runner lifecycle lost its tenant-scoped workspace.')
      }
      if (input.run !== undefined) {
        const runUpdated = await transaction
          .update(runs)
          .set({ state: input.run.state, endedAt: new Date(input.run.endedAt!) })
          .where(
            and(
              eq(runs.organizationId, input.run.organizationId),
              eq(runs.projectId, input.run.projectId),
              eq(runs.id, input.run.id),
            ),
          )
          .returning({ id: runs.id })
        if (runUpdated.length !== 1) throw new Error('Runner cancellation lost its scoped run.')
      }
      await insertAudit(transaction, input.auditEvents)
    })
  }

  appendAuditEvent(event: RunnerAuditEvent): Promise<void> {
    return this.database
      .insert(auditEvents)
      .values(auditValue(event))
      .then(() => undefined)
  }
}

function workspaceRecord(row: typeof runnerWorkspaces.$inferSelect) {
  return {
    requestDigest: row.requestDigest,
    profile: runnerIsolationProfileV1Schema.parse(row.profile),
    workspace: runnerWorkspaceV1Schema.parse({
      schemaVersion: '1',
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      runId: row.runId,
      executionPlanId: row.executionPlanId,
      baseCommit: row.baseCommit,
      profileDigest: row.profileDigest,
      backendClass: row.backendClass,
      checkoutEvidence: row.checkoutEvidence,
      state: row.state,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }),
  }
}

function parseRun(row: typeof runs.$inferSelect) {
  return runV1Schema.parse({
    schemaVersion: '1',
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    changeRequestId: row.changeRequestId,
    executionPlanId: row.executionPlanId,
    baseCommit: row.baseCommit,
    state: row.state,
    policySnapshot: row.policySnapshot,
    createdAt: row.createdAt.toISOString(),
    ...(row.startedAt === null ? {} : { startedAt: row.startedAt.toISOString() }),
    ...(row.endedAt === null ? {} : { endedAt: row.endedAt.toISOString() }),
  })
}

function commandResult(
  row: typeof runnerCommands.$inferSelect,
  artifacts: readonly (typeof runnerArtifacts.$inferSelect)[],
): RunnerExecutionResultV1 {
  return runnerExecutionResultV1Schema.parse({
    schemaVersion: '1',
    commandId: row.id,
    workspaceId: row.workspaceId,
    runId: row.runId,
    baseCommit: row.baseCommit,
    profileDigest: row.profileDigest,
    executionKind: row.executionKind,
    status: row.status,
    ...(row.exitCode === null ? {} : { exitCode: row.exitCode }),
    ...(row.rejectionCode === null ? {} : { rejectionCode: row.rejectionCode }),
    ...(row.stdoutRef === null ? {} : { stdoutRef: row.stdoutRef }),
    ...(row.stderrRef === null ? {} : { stderrRef: row.stderrRef }),
    artifacts: artifacts.map((artifact) => ({
      path: artifact.path,
      commandId: artifact.commandId,
      reference: artifact.reference,
      sizeBytes: artifact.sizeBytes,
    })),
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
  })
}

async function insertAudit(
  transaction: Parameters<Parameters<PlatformDatabase['transaction']>[0]>[0],
  events: readonly RunnerAuditEvent[],
) {
  if (events.length > 0) await transaction.insert(auditEvents).values(events.map(auditValue))
}

function auditValue(event: RunnerAuditEvent) {
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
