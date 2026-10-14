import { assertPublicKey } from './public-key'

type PublicEnvSource = Record<string, string | boolean | undefined>

export type PublicEnv = {
  VITE_APP_URL: string
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
  VITE_SUPABASE_ANON_KEY?: string
}

// This bootstrap contract uses platform URL validation; form schemas remain
// lazy Zod modules so their parser is not downloaded before a route needs it.
function publicUrl(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} es obligatorio.`)
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${name} debe ser una URL HTTP(S) sin credenciales.`)
  }
  return value
}

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
  for (const key of Object.keys(source)) {
    if (key.startsWith('VITE_') && /SECRET|PRIVATE|SERVICE_ROLE|WORKER_TOKEN|ENCRYPTION|SIGNING|PROVIDER_KEY/i.test(key) && stringValue(source, key)) {
      throw new Error(`${key} es un secret privilegiado y no puede exponerse con VITE_*.`)
    }
  }
  for (const key of forbiddenFrontendSecrets) {
    if (stringValue(source, key)) {
      throw new Error(`${key} es un secret privilegiado y no puede exponerse con VITE_*.`)
    }
  }

  const publishable = stringValue(source, 'VITE_SUPABASE_PUBLISHABLE_KEY')
  const anon = stringValue(source, 'VITE_SUPABASE_ANON_KEY')
  if (Boolean(publishable) === Boolean(anon)) {
    throw new Error('Configure exactamente una clave pública de Supabase: publishable o anon legacy.')
  }
  assertPublicKey((publishable ?? anon)!)
  return {
    VITE_APP_URL: publicUrl(stringValue(source, 'VITE_APP_URL'), 'VITE_APP_URL'),
    VITE_SUPABASE_URL: publicUrl(stringValue(source, 'VITE_SUPABASE_URL'), 'VITE_SUPABASE_URL'),
    VITE_SUPABASE_PUBLISHABLE_KEY: publishable,
    VITE_SUPABASE_ANON_KEY: anon,
  }
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
