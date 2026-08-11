import type {
  ApprovalRecordV1,
  ChangeTargetV1,
  ExecutionPlanV1,
  PlanAnalysisV1,
  RiskClassV1,
  RiskSignalCodeV1,
  RunStateV1,
} from '@platform/contracts'

import { PlatformError } from './error.js'

const highRiskSignals = new Set<RiskSignalCodeV1>([
  'authentication',
  'authorization',
  'payment',
  'secret',
  'infrastructure',
  'database_migration',
  'destructive_action',
  'production_change',
])

const signalPatterns: ReadonlyArray<readonly [RiskSignalCodeV1, RegExp]> = [
  ['prohibited_request', /\b(?:bypass security|credential theft|disable audit|prohibited)\b/u],
  ['destructive_action', /\b(?:destructive|drop table|delete (?:all )?data|reset database)\b/u],
  ['database_migration', /\b(?:database migration|schema migration|alter table)\b/u],
  ['infrastructure', /\b(?:infrastructure|dns|firewall|cloud configuration)\b/u],
  ['secret', /\b(?:secret|credential|api key|private key)\b/u],
  ['payment', /\b(?:payment|billing|checkout|stripe)\b/u],
  ['authorization', /\b(?:authorization|permission|rbac|access control)\b/u],
  ['authentication', /\b(?:authentication|sign[ -]?in|login|oauth)\b/u],
  ['new_dependency', /\b(?:new dependency|add package|third-party package)\b/u],
  ['public_api', /\b(?:public api|api contract|breaking api)\b/u],
  ['accessibility', /\b(?:accessibility|wcag|screen reader)\b/u],
]

export interface PlanPolicyAssessment {
  readonly riskClass: RiskClassV1
  readonly riskSignals: readonly RiskSignalCodeV1[]
  readonly requiredAnalyses: readonly PlanAnalysisV1[]
  readonly requestedApprovals: readonly ExecutionPlanV1['requestedApprovals'][number][]
}

export function classifyPlanRisk(input: {
  readonly target: ChangeTargetV1
  readonly riskSignals: readonly string[]
  readonly taskObjectives: readonly string[]
  readonly expectedFiles: readonly string[]
}): PlanPolicyAssessment {
  const text = [...input.riskSignals, ...input.taskObjectives, ...input.expectedFiles]
    .join(' ')
    .toLocaleLowerCase('en-US')
  const signals = new Set<RiskSignalCodeV1>()
  for (const [signal, pattern] of signalPatterns) if (pattern.test(text)) signals.add(signal)
  if (input.target === 'production') signals.add('production_change')

  const orderedSignals = [...signals].sort()
  const riskClass: RiskClassV1 = signals.has('prohibited_request')
    ? 'blocked'
    : orderedSignals.some((signal) => highRiskSignals.has(signal))
      ? 'high'
      : orderedSignals.length > 0
        ? 'medium'
        : 'low'
  const requiredAnalyses = new Set<PlanAnalysisV1>()
  if (
    signals.has('infrastructure') ||
    signals.has('database_migration') ||
    signals.has('public_api')
  ) {
    requiredAnalyses.add('architecture')
  }
  if (
    signals.has('authentication') ||
    signals.has('authorization') ||
    signals.has('payment') ||
    signals.has('secret') ||
    signals.has('infrastructure') ||
    signals.has('destructive_action') ||
    signals.has('prohibited_request')
  ) {
    requiredAnalyses.add('security')
  }
  if (signals.has('accessibility')) requiredAnalyses.add('ui_ux')

  const requestedApprovals: PlanPolicyAssessment['requestedApprovals'] =
    riskClass === 'high'
      ? [
          'plan_execution',
          ...(signals.has('destructive_action') ? (['destructive_action'] as const) : []),
          ...(signals.has('production_change') ? (['production_promotion'] as const) : []),
        ]
      : []
  return {
    riskClass,
    riskSignals: orderedSignals,
    requiredAnalyses: [...requiredAnalyses].sort(),
    requestedApprovals,
  }
}

export function executionGateState(input: {
  readonly plan: ExecutionPlanV1
  readonly approvals?: readonly ApprovalRecordV1[]
}): RunStateV1 {
  if (!hasCompletedRequiredAnalyses(input.plan)) return 'PLANNING'
  if (input.plan.riskClass === 'blocked') return 'REJECTED'
  if (input.plan.requestedApprovals.length === 0) return 'QUEUED'
  const decisions = input.plan.requestedApprovals.map((gate) =>
    input.approvals?.find(
      (approval) =>
        approval.gate === gate &&
        approval.planId === input.plan.id &&
        approval.planRevision === input.plan.revision &&
        approval.policyVersion === input.plan.policySnapshot.policyVersion,
    ),
  )
  if (decisions.some((approval) => approval?.decision === 'rejected')) return 'REJECTED'
  if (decisions.some((approval) => approval?.decision !== 'approved')) {
    return 'AWAITING_APPROVAL'
  }
  return 'QUEUED'
}

export function hasCompletedRequiredAnalyses(plan: ExecutionPlanV1): boolean {
  return (
    plan.analyses.length === plan.requiredAnalyses.length &&
    plan.requiredAnalyses.every(
      (required) =>
        plan.analyses.filter(
          (analysis) =>
            analysis.analysis === required &&
            analysis.status === 'completed' &&
            analysis.requirementId === plan.requirementId &&
            analysis.baseCommit === plan.baseCommit &&
            analysis.policySnapshotDigest === plan.policySnapshot.digest,
        ).length === 1,
    )
  )
}

export function decideApproval(input: {
  readonly current: ApprovalRecordV1
  readonly approverId: string
  readonly decision: 'approved' | 'rejected'
  readonly rationale: string
  readonly decidedAt: string
  readonly authorized: boolean
  readonly separationOfDuties: boolean
  readonly correlationId: string
}): ApprovalRecordV1 {
  if (!input.authorized)
    throw policyError(
      input.correlationId,
      'AUTHORIZATION_DENIED',
      'Approval authorization was denied.',
    )
  if (input.separationOfDuties && input.approverId === input.current.requesterId) {
    throw policyError(
      input.correlationId,
      'AUTHORIZATION_DENIED',
      'The requester cannot approve this plan.',
    )
  }
  if (input.current.decision !== 'pending') {
    if (
      input.current.decision === input.decision &&
      input.current.approverId === input.approverId &&
      input.current.rationale === input.rationale
    ) {
      return input.current
    }
    throw policyError(input.correlationId, 'CONFLICT', 'The approval already has a final decision.')
  }
  return {
    ...input.current,
    decision: input.decision,
    approverId: input.approverId,
    rationale: input.rationale,
    decidedAt: input.decidedAt,
  }
}

export async function orchestrateExecutionGate(input: {
  readonly authority: 'orchestrator'
  readonly plan: ExecutionPlanV1
  readonly approvals?: readonly ApprovalRecordV1[]
  readonly mutateWorkspace: () => Promise<void>
}): Promise<RunStateV1> {
  if (input.authority !== 'orchestrator') {
    throw policyError(
      input.plan.id,
      'INVALID_TRANSITION',
      'Only orchestration may open the execution gate.',
    )
  }
  const state = executionGateState({
    plan: input.plan,
    ...(input.approvals === undefined ? {} : { approvals: input.approvals }),
  })
  if (state === 'QUEUED') await input.mutateWorkspace()
  return state
}

function policyError(
  correlationId: string,
  code: ConstructorParameters<typeof PlatformError>[0]['code'],
  safeMessage: string,
): PlatformError {
  return new PlatformError({
    code,
    correlationId,
    retryable: false,
    safeMessage,
  })
}
