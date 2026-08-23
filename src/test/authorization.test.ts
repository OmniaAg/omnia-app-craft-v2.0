import { describe, expect, it } from 'vitest'
import {
  defaultRouteFor,
  hasProjectedCapability,
  routeAfterSignIn,
  type AuthorizationProjection,
} from '../features/auth/model/authorization'

const emptyProjection: AuthorizationProjection = {
  profile: null,
  agencyMemberships: [],
  clientMemberships: [],
  capabilities: [],
}

describe('authorization UX projection', () => {
  it('resolves agency, client and forbidden routes without conflating contexts', () => {
    expect(
      defaultRouteFor({
        ...emptyProjection,
        agencyMemberships: [{ status: 'active' } as never],
      }),
    ).toBe('/app')
    expect(
      defaultRouteFor({
        ...emptyProjection,
        clientMemberships: [{ status: 'active' } as never],
      }),
    ).toBe('/portal')
    expect(defaultRouteFor(emptyProjection)).toBe('/forbidden')
  })

  it('keeps explicit capability scope in the UX hint', () => {
    const capabilities = [
      {
        capability_key: 'client_user.invite',
        scope_kind: 'organization',
        scope_id: 'organization-a',
      },
    ]

    expect(
      hasProjectedCapability(
        capabilities,
        'client_user.invite',
        'organization-a',
      ),
    ).toBe(true)
    expect(
      hasProjectedCapability(
        capabilities,
        'client_user.invite',
        'organization-b',
      ),
    ).toBe(false)
  })

  it('honors only an authorized internal route requested before login', () => {
    const dualProjection = {
      ...emptyProjection,
      agencyMemberships: [{ status: 'active' } as never],
      clientMemberships: [{ status: 'active' } as never],
    }

    expect(routeAfterSignIn(dualProjection, '/portal')).toBe('/portal')
    expect(routeAfterSignIn(dualProjection, 'https://untrusted.example')).toBe(
      '/app',
    )
    expect(routeAfterSignIn(emptyProjection, '/portal')).toBe('/forbidden')
  })
})
