import type { User } from '@supabase/supabase-js'
import type { Tables } from '../../../shared/api/supabase/database.types'
import { safePushPath } from '../../pwa/notification-destination'

export type Profile = Tables<'profiles'>
export type AgencyMembership = Tables<'agency_memberships'>
export type ClientMembership = Tables<'client_memberships'>

export type CapabilityProjection = {
  capability_key: string
  scope_id: string
  scope_kind: string
}

export type AuthorizationProjection = {
  profile: Profile | null
  agencyMemberships: AgencyMembership[]
  clientMemberships: ClientMembership[]
  capabilities: CapabilityProjection[]
}

export type AuthenticatedActor = AuthorizationProjection & {
  user: User
}

export function hasAgencyContext(
  projection: AuthorizationProjection,
): boolean {
  return projection.agencyMemberships.some(
    (membership) => membership.status === 'active',
  )
}

export function hasClientContext(
  projection: AuthorizationProjection,
): boolean {
  return projection.clientMemberships.some(
    (membership) => membership.status === 'active',
  )
}

export function defaultRouteFor(
  projection: AuthorizationProjection,
): '/app' | '/portal' | '/forbidden' {
  if (hasAgencyContext(projection)) {
    return '/app'
  }

  if (hasClientContext(projection)) {
    return '/portal'
  }

  return '/forbidden'
}

export function routeAfterSignIn(
  projection: AuthorizationProjection,
  requestedPath?: string,
): string {
  if (safePushPath(requestedPath) && ((requestedPath.startsWith('/app/') && hasAgencyContext(projection))
    || (requestedPath.startsWith('/portal/') && hasClientContext(projection)))) return requestedPath
  if (requestedPath === '/app' && hasAgencyContext(projection)) {
    return requestedPath
  }
  if (requestedPath === '/portal' && hasClientContext(projection)) {
    return requestedPath
  }

  return defaultRouteFor(projection)
}

export function hasProjectedCapability(
  capabilities: CapabilityProjection[],
  capabilityKey: string,
  scopeId?: string,
): boolean {
  return capabilities.some(
    (capability) =>
      capability.capability_key === capabilityKey &&
      (scopeId === undefined || capability.scope_id === scopeId),
  )
}
