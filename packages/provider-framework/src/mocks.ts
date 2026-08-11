import { createHash } from 'node:crypto'
import type {
  AiInvocationRequestV1,
  AiInvocationResultV1,
  ArtifactReferenceV1,
  DeploymentRequestV1,
  DeploymentResultV1,
  GitRepositoryRefV1,
  ProviderRequestContextV1,
  RunnerCommandV1,
  RunnerResultV1,
  SecretReferenceV1,
} from '@platform/contracts'
import {
  PlatformError,
  type AttachmentScannerPort,
  type AiCostControllerPort,
  type ArtifactStorePort,
  type DeploymentProviderPort,
  type GitProviderPort,
  type OrchestrationProviderPort,
  type RunnerProviderPort,
  type SecretsPort,
} from '@platform/domain'

export class MockAttachmentScanner implements AttachmentScannerPort {
  readonly #rejectedDigests: ReadonlySet<string>

  constructor(rejectedDigests: readonly string[] = []) {
    this.#rejectedDigests = new Set(rejectedDigests)
  }

  scan(attachment: Parameters<AttachmentScannerPort['scan']>[0]): Promise<'clean' | 'rejected'> {
    return Promise.resolve(this.#rejectedDigests.has(attachment.digest) ? 'rejected' : 'clean')
  }
}

export class MockSecretsAdapter implements SecretsPort {
  readonly #references = new Set<string>()
  register(reference: SecretReferenceV1): void {
    this.#references.add(this.key(reference))
  }
  exists(_context: ProviderRequestContextV1, reference: SecretReferenceV1): Promise<boolean> {
    return Promise.resolve(this.#references.has(this.key(reference)))
  }
  private key(reference: SecretReferenceV1) {
    return `${reference.provider}:${reference.key}:${reference.version ?? ''}`
  }
}

export class MockGitAdapter implements GitProviderPort {
  constructor(private readonly accessible = true) {}
  verifyRepository(_context: ProviderRequestContextV1, repository: GitRepositoryRefV1) {
    return Promise.resolve({ accessible: this.accessible, defaultBranch: repository.defaultBranch })
  }
}

export class MockDeploymentAdapter implements DeploymentProviderPort {
  constructor(private readonly available = true) {}

  requestPreview(request: DeploymentRequestV1): Promise<DeploymentResultV1> {
    if (!this.available) {
      return Promise.reject(
        new PlatformError({
          code: 'DEPENDENCY_UNAVAILABLE',
          correlationId: request.context.correlationId,
          retryable: true,
          safeMessage: 'The deployment provider is unavailable.',
        }),
      )
    }
    return Promise.resolve({
      schemaVersion: '1',
      providerDeploymentId: `mock-${request.commit.slice(0, 12)}`,
      status: 'ready',
      url: `https://preview.invalid/${request.commit}`,
    })
  }
}

export class MockArtifactStore implements ArtifactStorePort {
  readonly #artifacts = new Map<string, Uint8Array>()
  put(
    _context: ProviderRequestContextV1,
    content: Uint8Array,
    metadata: { readonly mediaType: string; readonly retentionClass: string },
  ): Promise<ArtifactReferenceV1> {
    const digest = createHash('sha256').update(content).digest('hex')
    this.#artifacts.set(digest, content.slice())
    return Promise.resolve({
      schemaVersion: '1',
      uri: `mock-artifact://${digest}`,
      digest,
      mediaType: metadata.mediaType,
      retentionClass: metadata.retentionClass,
    })
  }
}

export class MockRunnerAdapter implements RunnerProviderPort {
  execute(command: RunnerCommandV1): Promise<RunnerResultV1> {
    return Promise.resolve({ schemaVersion: '1', exitCode: command.command === 'fail' ? 1 : 0 })
  }
}

export class MockOrchestrationAdapter implements OrchestrationProviderPort {
  dispatch(context: ProviderRequestContextV1, commandRef: ArtifactReferenceV1) {
    return Promise.resolve({
      dispatchId: `mock-${context.idempotencyKey}-${commandRef.digest.slice(0, 8)}`,
    })
  }
}

/** M03 safety default: no model provider can be reached before controller policy exists. */
export class DenyAllAiCostController implements AiCostControllerPort {
  invoke(request: AiInvocationRequestV1): Promise<AiInvocationResultV1> {
    return Promise.reject(
      new PlatformError({
        code: 'AUTHORIZATION_DENIED',
        correlationId: request.context.correlationId,
        retryable: false,
        safeMessage:
          'AI invocation is disabled until cost, budget, routing, and usage policy is configured.',
      }),
    )
  }
}

export function deterministicOpaqueId(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
