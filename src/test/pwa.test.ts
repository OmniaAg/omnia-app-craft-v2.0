import { describe, expect, it, vi, afterEach } from 'vitest'
import { guardedFetch, assertOnline } from '../features/pwa/connectivity'
import { notificationDestination, safePushPath } from '../features/pwa/notification-destination'
import { pushEndpoint, pushOutcome } from '../../supabase/functions/_shared/push-security'
import { routeAfterSignIn, type AuthorizationProjection } from '../features/auth/model/authorization'
const id='10000000-0000-0000-0000-000000000005'
afterEach(() => vi.restoreAllMocks())
describe('Phase 14 boundaries',() => {
  it('rejects offline requests before transport without synthetic success',async () => {
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false)
    const send=vi.fn()
    expect(assertOnline).toThrow('sin conexión')
    await expect(guardedFetch(send)('https://test.invalid',{method:'POST'})).rejects.toThrow('sin conexión')
    expect(send).not.toHaveBeenCalled()
  })
  it('propagates real network failure while browser reports online',async () => {
    vi.spyOn(navigator,'onLine','get').mockReturnValue(true)
    const error=new TypeError('Failed to fetch')
    await expect(guardedFetch(vi.fn().mockRejectedValue(error))('/private')).rejects.toBe(error)
  })
  it('works in non-browser runtimes without an onLine feature',() => {
    vi.spyOn(navigator,'onLine','get').mockReturnValue(undefined as unknown as boolean)
    expect(assertOnline).not.toThrow()
  })
  it('allows only UUID push return routes and authorized actor surface',() => {
    for (const path of ['https://evil.test','//evil.test','/app/push/../../evil',`/app/push/${id}?redirect=https://evil.test`,'/app/billing']) expect(safePushPath(path)).toBe(false)
    const projection={agencyMemberships:[],clientMemberships:[{status:'active'}],capabilities:[],profile:null} as unknown as AuthorizationProjection
    expect(routeAfterSignIn(projection,`/portal/push/${id}`)).toBe(`/portal/push/${id}`)
    expect(routeAfterSignIn(projection,`/app/push/${id}`)).toBe('/portal')
  })
  it('builds destinations from persisted IDs, never payload URLs',() => {
    expect(notificationDestination({kind:'message_received',channel_id:id} as never,'/portal')).toBe(`/portal/messages/${id}`)
    expect(notificationDestination({kind:'message_received',channel_id:'https://evil.test'} as never,'/portal')).toBe('/portal/notifications')
  })
  it('rejects SSRF endpoint variants',() => {
    for (const endpoint of ['https://127.0.0.1/private','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com@evil.test/x','http://fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x','https://fcm.googleapis.com/x#hash']) expect(() => pushEndpoint(endpoint)).toThrow()
    expect(pushEndpoint('https://fcm.googleapis.com/fcm/send/test').hostname).toBe('fcm.googleapis.com')
  })
  it('classifies permanent failures separately from bounded retry candidates',() => {
    expect(pushOutcome(410)).toBe('gone'); expect(pushOutcome(404)).toBe('gone')
    expect(pushOutcome(429)).toBe('rate_limited'); expect(pushOutcome(503)).toBe('unavailable')
    expect(pushOutcome(403)).toBe('rejected'); expect(pushOutcome(201)).toBeNull()
  })
})
