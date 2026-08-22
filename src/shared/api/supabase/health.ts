import { getSupabaseClient, type OmniaSupabaseClient } from './client'

export type SupabaseHealth = {
  status: 'ok'
}

export async function checkSupabaseConnection(
  client: OmniaSupabaseClient = getSupabaseClient(),
): Promise<SupabaseHealth> {
  const { data, error } = await client.rpc('health_check')

  if (error) {
    throw new Error(`Supabase local no respondió correctamente: ${error.message}`)
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    Array.isArray(data) ||
    data.status !== 'ok'
  ) {
    throw new Error('Supabase local devolvió un diagnóstico inválido.')
  }

  return { status: 'ok' }
}
