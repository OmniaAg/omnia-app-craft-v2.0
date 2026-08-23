import { z } from 'zod'

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email('Escribe un correo válido.')
      .max(320, 'El correo es demasiado largo.'),
  )

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Escribe tu contraseña.'),
})

export const recoverySchema = z.object({
  email: emailSchema,
})

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(10, 'Usa al menos 10 caracteres.')
      .regex(/[a-z]/, 'Incluye una letra minúscula.')
      .regex(/[A-Z]/, 'Incluye una letra mayúscula.')
      .regex(/[0-9]/, 'Incluye un número.'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  })

export const invitationIdSchema = z.guid('La invitación no es válida.')

const invitationBaseSchema = z.object({
  email: emailSchema,
  idempotencyKey: z.guid(),
})

export const internalInvitationSchema = invitationBaseSchema
  .extend({
    kind: z.literal('internal'),
    agencyRoleKey: z.enum([
      'agency_director',
      'project_manager',
      'contributor',
    ]),
    departmentKey: z.string().trim().min(2).max(40),
    classification: z.enum([
      'founder',
      'employee',
      'external_collaborator',
      'contractor',
    ]),
  })
  .strict()

export const clientInvitationSchema = invitationBaseSchema
  .extend({
    kind: z.literal('client'),
    organizationId: z.guid(),
    clientRoleKey: z.enum([
      'client_admin',
      'client_reviewer',
      'client_viewer',
    ]),
  })
  .strict()

export const invitationSchema = z.discriminatedUnion('kind', [
  internalInvitationSchema,
  clientInvitationSchema,
])

export type LoginInput = z.input<typeof loginSchema>
export type RecoveryInput = z.input<typeof recoverySchema>
export type NewPasswordInput = z.input<typeof newPasswordSchema>
export type InvitationInput = z.input<typeof invitationSchema>
