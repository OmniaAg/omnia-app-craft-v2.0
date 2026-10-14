import { describe, expect, it } from 'vitest'
import {
  getSupabasePublicKey,
  parsePublicEnv,
} from '../shared/config/env'

const validEnvironment = {
  VITE_APP_URL: 'http://localhost:53170',
  VITE_SUPABASE_URL: 'http://127.0.0.1:56321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_test',
}

describe('public environment contract', () => {
  it('accepts the local URL and one publishable key', () => {
    expect(parsePublicEnv(validEnvironment)).toEqual(validEnvironment)
  })

  it('accepts the legacy anon key only as an exclusive fallback', () => {
    const environment = parsePublicEnv({
      VITE_APP_URL: 'http://localhost:53170',
      VITE_SUPABASE_URL: 'http://127.0.0.1:56321',
      VITE_SUPABASE_ANON_KEY: 'legacy-local-anon-key',
    })

    expect(getSupabasePublicKey(environment)).toBe('legacy-local-anon-key')
  })

  it('rejects malformed URLs', () => {
    expect(() =>
      parsePublicEnv({ ...validEnvironment, VITE_SUPABASE_URL: 'omnia-craft' }),
    ).toThrow()
  })

  it('rejects missing or ambiguous public keys', () => {
    const { VITE_SUPABASE_PUBLISHABLE_KEY: _, ...withoutKey } = validEnvironment

    expect(() => parsePublicEnv(withoutKey)).toThrow()
    expect(() =>
      parsePublicEnv({
        ...validEnvironment,
        VITE_SUPABASE_ANON_KEY: 'legacy-local-anon-key',
      }),
    ).toThrow()
  })

  it('rejects privileged secrets in the frontend contract', () => {
    expect(() =>
      parsePublicEnv({
        ...validEnvironment,
        VITE_SUPABASE_SERVICE_ROLE_KEY: 'never-public',
      }),
    ).toThrow(/secret privilegiado/)
  })
  it('rejects a server key disguised as a public key', () => {
    expect(() => parsePublicEnv({ ...validEnvironment, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fixture' })).toThrow()
    const payload = btoa(JSON.stringify({ role: 'service_role' }))
    expect(() => parsePublicEnv({ ...validEnvironment, VITE_SUPABASE_PUBLISHABLE_KEY: `eyJfixture.${payload}.signature` })).toThrow()
  })
})
