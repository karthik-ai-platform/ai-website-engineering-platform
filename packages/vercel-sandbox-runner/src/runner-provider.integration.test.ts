import { createHash } from 'node:crypto'

import type {
  RunnerCheckoutBundleV1,
  RunnerExecutionCommandV1,
  RunnerIsolationProfileV1,
  RunnerWorkspaceRequestV1,
} from '@platform/contracts'
import type { ArtifactStorePort, RunnerCheckoutBundleSourcePort } from '@platform/domain'
import { describe, expect, it, vi } from 'vitest'

import { VERCEL_RUNNER_IMAGE_SPEC_V1, vercelRunnerImageSpecDigest } from './image-policy.js'
import { MemoryVercelRunnerSessionStore, VercelSandboxRunnerProvider } from './runner-provider.js'
import type {
  VercelSandboxCommandResult,
  VercelSandboxCreateRequest,
  VercelSandboxFactory,
  VercelSandboxHandle,
} from './sdk-client.js'
import type { ApprovedVercelSandboxImageV1 } from './workspace-plan.js'

const id = (value: string) => `00000000-0000-4000-8000-${value.padStart(12, '0')}`
const now = new Date('2026-08-16T10:00:00.000Z')
const baseCommit = 'b'.repeat(40)
const bundleContent = new TextEncoder().encode('git bundle fixture')
const imageDigest = 'a'.repeat(64)
const profile: RunnerIsolationProfileV1 = {
  schemaVersion: '1',
  id: id('1'),
  version: 'vercel-node22-v1',
  backendClass: 'production_isolation',
  image: { reference: `team/project/runner@sha256:${imageDigest}`, digest: imageDigest },
  resources: {
    cpuMillicores: 2000,
    memoryMiB: 4096,
    timeoutMs: 600_000,
    maxProcesses: 256,
    maxFiles: 100_000,
    maxBytes: 4_294_967_296,
  },
  filesystem: { denyHostFilesystem: true, writableRoots: ['.'] },
  processes: { shell: false, allowedCommands: [{ tool: 'npm-test', executable: 'npm' }] },
  network: { mode: 'denied' },
  dependencies: {
    approvedRegistries: ['https://registry.npmjs.org'],
    installScripts: 'denied',
    allowedInstallScripts: [],
  },
  secrets: { allowProductionSecrets: false, allowedReferenceKeys: [] },
  artifacts: {
    maxCount: 20,
    maxBytes: 10_000_000,
    allowedMediaTypes: ['text/plain'],
    retentionClasses: ['validation-log'],
  },
}
const request: RunnerWorkspaceRequestV1 = {
  schemaVersion: '1',
  context: {
    schemaVersion: '1',
    organizationId: id('2'),
    projectId: id('3'),
    actorRef: `service:${id('4')}`,
    correlationId: id('5'),
    idempotencyKey: 'provision-runner-1',
    requestedAt: now.toISOString(),
  },
  runId: id('6'),
  executionPlanId: id('7'),
  repository: { provider: 'github', repositoryId: '12345' },
  baseCommit,
  profile,
}
const approvedImage: ApprovedVercelSandboxImageV1 = {
  schemaVersion: '1',
  profileId: profile.id,
  profileVersion: profile.version,
  sdkVersion: '3.0.0',
  imageReference: profile.image.reference,
  imageDigest,
  controls: {
    hostFilesystemDenied: true,
    productionSecretsAbsent: true,
    sudoRemoved: true,
    commandBrokerPath: '/opt/ai-website-platform/bin/runner-exec',
    imageSpecDigest: vercelRunnerImageSpecDigest(),
    commandPaths: [...VERCEL_RUNNER_IMAGE_SPEC_V1.commandPaths],
    maxProcesses: profile.resources.maxProcesses,
    maxFiles: profile.resources.maxFiles,
    maxBytes: profile.resources.maxBytes,
    installScripts: 'denied',
  },
}

function bundle(): RunnerCheckoutBundleV1 {
  return {
    schemaVersion: '1',
    requestId: id('8'),
    repository: request.repository,
    baseCommit,
    bundleDigest: createHash('sha256').update(bundleContent).digest('hex'),
    issuedAt: now.toISOString(),
    expiresAt: '2026-08-16T10:04:00.000Z',
    content: bundleContent,
  }
}

function provider(
  checkoutStatus: 'succeeded' | 'failed' = 'succeeded',
  artifactContent?: Buffer,
  readArtifactContent = artifactContent,
) {
  let runCommandCalls = 0
  let stopCalls = 0
  const createBundle = vi.fn<RunnerCheckoutBundleSourcePort['createBundle']>(() =>
    Promise.resolve(bundle()),
  )
  const createSandbox = vi.fn((create: VercelSandboxCreateRequest) => {
    const writeFiles = vi.fn<VercelSandboxHandle['writeFiles']>(() => Promise.resolve())
    const runCommand = vi.fn<VercelSandboxHandle['runCommand']>((command) => {
      runCommandCalls += 1
      const requestId = command.args[0]?.match(/([a-f0-9-]{36})\.json$/u)?.[1]
      const body =
        requestId === id('8')
          ? checkoutStatus === 'succeeded'
            ? {
                schemaVersion: '1',
                requestId,
                action: 'checkout',
                status: 'succeeded',
                commit: baseCommit,
                treeDigest: 'c'.repeat(64),
                detached: true,
                clean: true,
              }
            : {
                schemaVersion: '1',
                requestId,
                action: 'checkout',
                status: 'failed',
                failureCode: 'CHECKOUT_FAILED',
              }
          : {
              schemaVersion: '1',
              requestId,
              action: 'execute',
              status: 'succeeded',
              exitCode: 0,
              durationMs: 25,
              stdoutDigest: 'd'.repeat(64),
              stderrDigest: 'e'.repeat(64),
              stdoutBytes: 10,
              stderrBytes: 0,
              artifacts:
                artifactContent === undefined
                  ? []
                  : [
                      {
                        path: 'report.txt',
                        digest: createHash('sha256').update(artifactContent).digest('hex'),
                        sizeBytes: artifactContent.byteLength,
                      },
                    ],
            }
      return Promise.resolve({
        exitCode: 0,
        stdout: () => Promise.resolve(JSON.stringify(body)),
        stderr: () => Promise.resolve(''),
      } satisfies VercelSandboxCommandResult)
    })
    const handle = {
      name: create.name,
      image: create.image,
      vcpus: create.resources.vcpus,
      memory: create.resources.vcpus * 2048,
      timeout: create.timeout,
      persistent: false,
      status: 'running',
      expiresAt: new Date('2026-08-16T10:10:00.000Z'),
      networkPolicy: create.networkPolicy,
      writeFiles,
      runCommand,
      readFileToBuffer: vi.fn(() => Promise.resolve(readArtifactContent ?? null)),
      stop: vi.fn(() => {
        stopCalls += 1
        return Promise.resolve(undefined)
      }),
    }
    return Promise.resolve(handle)
  })
  const factory: VercelSandboxFactory = { create: createSandbox }
  const artifactPut = vi.fn<ArtifactStorePort['put']>((_context, content, metadata) =>
    Promise.resolve({
      schemaVersion: '1',
      uri: `fixture-artifact://${createHash('sha256').update(content).digest('hex')}`,
      digest: createHash('sha256').update(content).digest('hex'),
      ...metadata,
    }),
  )
  const artifactStore: ArtifactStorePort | undefined =
    artifactContent === undefined ? undefined : { put: artifactPut }
  const runner = new VercelSandboxRunnerProvider({
    approvedImages: [approvedImage],
    ...(artifactStore === undefined ? {} : { artifactStore }),
    bundleSource: { createBundle },
    clock: () => now,
    factory,
    idFactory: () => id('9'),
    sessions: new MemoryVercelRunnerSessionStore(),
  })
  return {
    runner,
    createBundle,
    createSandbox,
    runCommandCallCount: () => runCommandCalls,
    stopCallCount: () => stopCalls,
    artifactPut,
  }
}

describe('Vercel Sandbox RunnerProvider lifecycle', () => {
  it('composes bundle acquisition, verified checkout, execution, cancellation, and cleanup idempotently', async () => {
    const fixture = provider()
    const workspace = await fixture.runner.provision(request)
    await expect(fixture.runner.provision(request)).resolves.toEqual(workspace)
    expect(fixture.createSandbox).toHaveBeenCalledOnce()
    expect(fixture.createBundle).toHaveBeenCalledOnce()
    expect(workspace).toMatchObject({
      backendClass: 'production_isolation',
      baseCommit,
      checkoutEvidence: { source: 'isolated_runtime', commit: baseCommit, clean: true },
    })

    const command: RunnerExecutionCommandV1 = {
      schemaVersion: '1',
      context: { ...request.context, idempotencyKey: 'execute-runner-1' },
      id: id('10'),
      workspaceId: workspace.id,
      runId: workspace.runId,
      baseCommit,
      profileDigest: workspace.profileDigest,
      tool: 'npm-test',
      executable: 'npm',
      arguments: ['test'],
      workingDirectory: '.',
      timeoutMs: 60_000,
      expectedArtifacts: [],
    }
    const [result, concurrentResult] = await Promise.all([
      fixture.runner.execute(command),
      fixture.runner.execute(command),
    ])
    expect(concurrentResult).toEqual(result)
    await expect(fixture.runner.execute(command)).resolves.toEqual(result)
    expect(result).toMatchObject({
      executionKind: 'isolated_runtime',
      status: 'succeeded',
      exitCode: 0,
    })
    expect(fixture.runCommandCallCount()).toBe(2)

    const cancellation = {
      schemaVersion: '1' as const,
      context: request.context,
      workspaceId: workspace.id,
      runId: workspace.runId,
      reason: 'User requested cancellation.',
    }
    expect((await fixture.runner.cancel(cancellation)).status).toBe('cancelled')
    expect((await fixture.runner.cancel(cancellation)).status).toBe('already_cancelled')
    const cleanup = {
      schemaVersion: '1' as const,
      context: request.context,
      workspaceId: workspace.id,
      runId: workspace.runId,
    }
    expect((await fixture.runner.destroy(cleanup)).status).toBe('destroyed')
    expect((await fixture.runner.destroy(cleanup)).status).toBe('already_destroyed')
    expect(fixture.stopCallCount()).toBe(1)
  })

  it('rejects cross-tenant lifecycle access without stopping another tenant workspace', async () => {
    const fixture = provider()
    const workspace = await fixture.runner.provision(request)
    await expect(
      fixture.runner.destroy({
        schemaVersion: '1',
        context: { ...request.context, projectId: id('99') },
        workspaceId: workspace.id,
        runId: workspace.runId,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' })
    expect(fixture.stopCallCount()).toBe(0)
  })

  it('fails closed before command staging when artifact capture is not composed', async () => {
    const fixture = provider()
    const workspace = await fixture.runner.provision(request)
    await expect(
      fixture.runner.execute({
        schemaVersion: '1',
        context: { ...request.context, idempotencyKey: 'execute-artifact-1' },
        id: id('11'),
        workspaceId: workspace.id,
        runId: workspace.runId,
        baseCommit,
        profileDigest: workspace.profileDigest,
        tool: 'npm-test',
        executable: 'npm',
        arguments: ['test'],
        workingDirectory: '.',
        timeoutMs: 60_000,
        expectedArtifacts: [
          { path: 'report.txt', mediaType: 'text/plain', retentionClass: 'validation-log' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_INVALID', retryable: false })
    expect(fixture.runCommandCallCount()).toBe(1)
  })

  it('independently verifies and stores broker-attested artifacts with retention evidence', async () => {
    const artifactContent = Buffer.from('validated report')
    const fixture = provider('succeeded', artifactContent)
    const workspace = await fixture.runner.provision(request)
    const result = await fixture.runner.execute({
      schemaVersion: '1',
      context: { ...request.context, idempotencyKey: 'execute-artifact-2' },
      id: id('12'),
      workspaceId: workspace.id,
      runId: workspace.runId,
      baseCommit,
      profileDigest: workspace.profileDigest,
      tool: 'npm-test',
      executable: 'npm',
      arguments: ['test'],
      workingDirectory: '.',
      timeoutMs: 60_000,
      expectedArtifacts: [
        { path: 'report.txt', mediaType: 'text/plain', retentionClass: 'validation-log' },
      ],
    })

    expect(result.status).toBe('succeeded')
    expect(result.artifacts).toHaveLength(1)
    const evidence = result.artifacts[0]
    expect(evidence?.path).toBe('report.txt')
    expect(evidence?.sizeBytes).toBe(artifactContent.byteLength)
    expect(evidence?.reference).toMatchObject({
      digest: createHash('sha256').update(artifactContent).digest('hex'),
      mediaType: 'text/plain',
      retentionClass: 'validation-log',
    })
    expect(fixture.artifactPut).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: request.context.organizationId }),
      artifactContent,
      { mediaType: 'text/plain', retentionClass: 'validation-log' },
    )
  })

  it('stops the workspace when provider-read artifact bytes differ from broker evidence', async () => {
    const fixture = provider(
      'succeeded',
      Buffer.from('broker-attested report'),
      Buffer.from('mutated report'),
    )
    const workspace = await fixture.runner.provision(request)
    await expect(
      fixture.runner.execute({
        schemaVersion: '1',
        context: { ...request.context, idempotencyKey: 'execute-artifact-3' },
        id: id('13'),
        workspaceId: workspace.id,
        runId: workspace.runId,
        baseCommit,
        profileDigest: workspace.profileDigest,
        tool: 'npm-test',
        executable: 'npm',
        arguments: ['test'],
        workingDirectory: '.',
        timeoutMs: 60_000,
        expectedArtifacts: [
          { path: 'report.txt', mediaType: 'text/plain', retentionClass: 'validation-log' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', retryable: false })
    expect(fixture.stopCallCount()).toBe(1)
  })

  it('stops and refuses to register a workspace when immutable checkout fails', async () => {
    const fixture = provider('failed')
    await expect(fixture.runner.provision(request)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
    expect(fixture.stopCallCount()).toBe(1)
  })
})
