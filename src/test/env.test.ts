import { describe, expect, it } from 'vitest'
import { parsePublicEnv } from '../shared/config/env'

describe('public environment contract', () => {
  it('accepts an absolute application URL', () => {
    expect(
      parsePublicEnv({ VITE_APP_URL: 'https://craft.omnia.example' }),
    ).toEqual({ VITE_APP_URL: 'https://craft.omnia.example' })
  })

  it('uses the Phase 0 local default when no value exists', () => {
    expect(parsePublicEnv({})).toEqual({
      VITE_APP_URL: 'http://localhost:5173',
    })
  })

  it('rejects malformed URLs', () => {
    expect(() => parsePublicEnv({ VITE_APP_URL: 'omnia-craft' })).toThrow()
  })
})
