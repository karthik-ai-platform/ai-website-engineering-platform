import type { ArtifactReferenceV1, RequirementSpecV1 } from '@platform/contracts'
import type { AiCostControllerPort, ArtifactStorePort, RequirementRolePort } from '@platform/domain'

export interface RequirementOutputReaderPort {
  read(reference: ArtifactReferenceV1): Promise<unknown>
}

export class AiControlledRequirementRole implements RequirementRolePort {
  constructor(
    private readonly artifacts: ArtifactStorePort,
    private readonly controller: AiCostControllerPort,
    private readonly outputReader: RequirementOutputReaderPort,
    private readonly maximumCost: { readonly currency: string; readonly amount: string },
  ) {}

  async normalize(input: Parameters<RequirementRolePort['normalize']>[0]) {
    const context = {
      schemaVersion: '1' as const,
      organizationId: input.changeRequest.organizationId,
      projectId: input.changeRequest.projectId,
      actorRef: `${input.actor.actorType}:${input.actor.actorId}`,
      correlationId: input.actor.correlationId,
      idempotencyKey: input.changeRequest.idempotencyKey,
      requestedAt: input.changeRequest.createdAt,
    }
    const inputRef = await this.artifacts.put(
      context,
      new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: '1',
          role: 'requirement',
          changeRequest: input.changeRequest,
        }),
      ),
      { mediaType: 'application/json', retentionClass: 'change-request-input' },
    )
    const result = await this.controller.invoke({
      schemaVersion: '1',
      context,
      requestType: 'requirement-normalization',
      inputRef,
      capability: 'structured-output',
      dataClassification: 'confidential',
      maximumCost: this.maximumCost,
    })
    const output: unknown = await this.outputReader.read(result.outputRef)
    return {
      output: output as RequirementSpecV1,
      evidence: {
        source: 'ai-cost-controller' as const,
        estimateId: result.estimateId,
        budgetDecisionId: result.budgetDecisionId,
        routingDecisionId: result.routingDecisionId,
        pricingVersion: result.pricingVersion,
        usageRecordId: result.usageRecordId,
      },
    }
  }
}
