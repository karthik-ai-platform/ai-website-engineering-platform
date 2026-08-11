import type { ArtifactReferenceV1, ProviderRequestContextV1 } from '@platform/contracts'

/** Internal adapter seam. Application and agent packages must use AiCostControllerPort. */
export interface ModelProviderAdapter {
  invoke(request: {
    readonly context: ProviderRequestContextV1
    readonly capability: string
    readonly inputRef: ArtifactReferenceV1
    readonly routeKey: string
  }): Promise<{
    readonly outputRef: ArtifactReferenceV1
    readonly inputUnits: number
    readonly outputUnits: number
  }>
}
