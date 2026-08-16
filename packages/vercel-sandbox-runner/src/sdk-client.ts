import { Sandbox, type NetworkPolicy } from '@vercel/sandbox'

export interface VercelSandboxCreateRequest {
  readonly name: string
  readonly image: string
  readonly resources: { readonly vcpus: number }
  readonly timeout: number
  readonly networkPolicy: NetworkPolicy
  readonly persistent: false
  readonly ports: readonly []
  readonly tags: Readonly<Record<string, string>>
}

export interface VercelSandboxHandle {
  readonly name: string
  readonly image: string | undefined
  readonly vcpus: number | undefined
  readonly memory: number | undefined
  readonly timeout: number | undefined
  readonly persistent: boolean
  readonly status: string
  readonly expiresAt: Date | undefined
  readonly networkPolicy: NetworkPolicy | undefined
  stop(): Promise<unknown>
}

export interface VercelSandboxFactory {
  create(request: VercelSandboxCreateRequest): Promise<VercelSandboxHandle>
}

/** Live SDK boundary. Credentials are resolved by Vercel OIDC or its credential chain. */
export class SdkVercelSandboxFactory implements VercelSandboxFactory {
  async create(request: VercelSandboxCreateRequest): Promise<VercelSandboxHandle> {
    return Sandbox.create({
      name: request.name,
      image: request.image,
      resources: request.resources,
      timeout: request.timeout,
      networkPolicy: request.networkPolicy,
      persistent: request.persistent,
      ports: [...request.ports],
      tags: { ...request.tags },
      env: {},
    })
  }
}
