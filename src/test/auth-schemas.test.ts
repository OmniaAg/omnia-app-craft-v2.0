import { describe, expect, it } from 'vitest'
import {
  clientInvitationSchema,
  loginSchema,
  newPasswordSchema,
} from '../features/auth/model/schemas'

describe('auth input schemas', () => {
  it('normalizes email without transforming password input', () => {
    expect(
      loginSchema.parse({
        email: '  Person@Omnia.Local ',
        password: 'preserve whitespace ',
      }),
    ).toEqual({
      email: 'person@omnia.local',
      password: 'preserve whitespace ',
    })
  })

  it('enforces the local password policy and matching confirmation', () => {
    expect(
      newPasswordSchema.safeParse({
        password: 'weak',
        confirmPassword: 'different',
      }).success,
    ).toBe(false)
    expect(
      newPasswordSchema.safeParse({
        password: 'StrongLocal2026',
        confirmPassword: 'StrongLocal2026',
      }).success,
    ).toBe(true)
  })

  it('rejects authority fields not defined by the client invitation contract', () => {
    const validInput = {
      kind: 'client' as const,
      email: 'client@omnia.local',
      organizationId: '30000000-0000-0000-0000-00000000000a',
      clientRoleKey: 'client_viewer' as const,
      idempotencyKey: '60000000-0000-0000-0000-000000000001',
    }

    expect(clientInvitationSchema.safeParse(validInput).success).toBe(true)
    expect(
      clientInvitationSchema.safeParse({
        ...validInput,
        capabilities: ['audit.view'],
      }).success,
    ).toBe(false)
  })
})
