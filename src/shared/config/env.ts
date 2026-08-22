import { z } from 'zod'

const publicEnvSchema = z.object({
  VITE_APP_URL: z.string().url(),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
}).superRefine((value, context) => {
  const configuredKeys = [
    value.VITE_SUPABASE_PUBLISHABLE_KEY,
    value.VITE_SUPABASE_ANON_KEY,
  ].filter(Boolean)

  if (configuredKeys.length !== 1) {
    context.addIssue({
      code: 'custom',
      message:
        'Configure exactamente una clave pública de Supabase: publishable o anon legacy.',
      path: ['VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
  }
})

type PublicEnvSource = Record<string, string | boolean | undefined>

export type PublicEnv = z.infer<typeof publicEnvSchema>

const forbiddenFrontendSecrets = [
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_SECRET_KEY',
  'VITE_VAPID_PRIVATE_KEY',
] as const

function stringValue(
  source: PublicEnvSource,
  key: string,
): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function parsePublicEnv(source: PublicEnvSource): PublicEnv {
  for (const key of forbiddenFrontendSecrets) {
    if (stringValue(source, key)) {
      throw new Error(`${key} es un secret privilegiado y no puede exponerse con VITE_*.`)
    }
  }

  return publicEnvSchema.parse({
    VITE_APP_URL: stringValue(source, 'VITE_APP_URL'),
    VITE_SUPABASE_URL: stringValue(source, 'VITE_SUPABASE_URL'),
    VITE_SUPABASE_PUBLISHABLE_KEY: stringValue(
      source,
      'VITE_SUPABASE_PUBLISHABLE_KEY',
    ),
    VITE_SUPABASE_ANON_KEY: stringValue(source, 'VITE_SUPABASE_ANON_KEY'),
  })
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv(import.meta.env)
}

export function getSupabasePublicKey(environment: PublicEnv): string {
  const key =
    environment.VITE_SUPABASE_PUBLISHABLE_KEY ??
    environment.VITE_SUPABASE_ANON_KEY

  if (!key) {
    throw new Error('No hay una clave pública de Supabase configurada.')
  }

  return key
}
