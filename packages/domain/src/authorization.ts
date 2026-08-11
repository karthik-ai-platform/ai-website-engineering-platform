import type {
  ActorContextV1,
  AuthorizationDecisionV1,
  OrganizationRoleV1,
  ProjectPermissionV1,
} from '@platform/contracts'

export interface HumanMembership {
  readonly actorId: string
  readonly organizationId: string
  readonly role: OrganizationRoleV1
  readonly status: 'active' | 'suspended' | 'revoked'
}

export interface ServiceGrant {
  readonly actorId: string
  readonly organizationId: string
  readonly projectId?: string
  readonly permissions: readonly ProjectPermissionV1[]
  readonly status: 'active' | 'suspended' | 'revoked'
}

export interface AuthorizationContext {
  readonly actor: ActorContextV1
  readonly correlationId: string
  readonly membership?: HumanMembership
  readonly serviceGrant?: ServiceGrant
  readonly organizationId: string
  readonly permission: ProjectPermissionV1
  readonly projectId?: string
  readonly decidedAt: Date
}

const rolePermissions = {
  owner: [
    'project:read',
    'project:create',
    'project:archive',
    'project:restore',
    'project:delete',
    'change:request',
    'change:approve',
    'git:merge',
    'release:promote',
    'secret:manage',
    'policy:modify',
    'member:manage',
  ],
  developer: ['project:read', 'change:request'],
  designer: ['project:read', 'change:request'],
  reviewer: ['project:read', 'change:approve'],
  viewer: ['project:read'],
} as const satisfies Record<OrganizationRoleV1, readonly ProjectPermissionV1[]>

export function authorize(context: AuthorizationContext): AuthorizationDecisionV1 {
  const base = {
    schemaVersion: '1' as const,
    actorId: context.actor.actorId,
    actorType: context.actor.actorType,
    organizationId: context.organizationId,
    ...(context.projectId === undefined ? {} : { projectId: context.projectId }),
    permission: context.permission,
    correlationId: context.correlationId,
    decidedAt: context.decidedAt.toISOString(),
  }

  if (
    context.actor.organizationId !== undefined &&
    context.actor.organizationId !== context.organizationId
  ) {
    return { ...base, allowed: false, reason: 'tenant_mismatch' }
  }

  if (context.actor.actorType === 'service') {
    const grant = context.serviceGrant
    if (grant === undefined) return { ...base, allowed: false, reason: 'membership_missing' }
    if (
      grant.actorId !== context.actor.actorId ||
      grant.organizationId !== context.organizationId ||
      (grant.projectId !== undefined && grant.projectId !== context.projectId)
    )
      return { ...base, allowed: false, reason: 'tenant_mismatch' }
    if (grant.status !== 'active') return { ...base, allowed: false, reason: 'membership_inactive' }
    return grant.permissions.includes(context.permission)
      ? { ...base, allowed: true, reason: 'allowed' }
      : { ...base, allowed: false, reason: 'permission_missing' }
  }

  const membership = context.membership
  if (membership === undefined) return { ...base, allowed: false, reason: 'membership_missing' }
  if (
    membership.actorId !== context.actor.actorId ||
    membership.organizationId !== context.organizationId
  )
    return { ...base, allowed: false, reason: 'tenant_mismatch' }
  if (membership.status !== 'active')
    return { ...base, allowed: false, reason: 'membership_inactive' }

  return rolePermissions[membership.role].includes(context.permission as never)
    ? { ...base, allowed: true, reason: 'allowed' }
    : { ...base, allowed: false, reason: 'permission_missing' }
}

export function permissionsForRole(role: OrganizationRoleV1): readonly ProjectPermissionV1[] {
  return rolePermissions[role]
}
