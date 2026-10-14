import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  getPublicEnv,
  getSupabasePublicKey,
  type PublicEnv,
} from '../../config/env'
import type { Database } from './database.types'
import { guardedFetch } from '../../../features/pwa/connectivity'

export type OmniaSupabaseClient = SupabaseClient<Database>

type ClientOptions = {
  fetch?: typeof fetch
  persistSession?: boolean
}

export function createBrowserSupabaseClient(
  environment: PublicEnv,
  options: ClientOptions = {},
): OmniaSupabaseClient {
  return createClient<Database>(
    environment.VITE_SUPABASE_URL,
    getSupabasePublicKey(environment),
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: options.persistSession ?? true,
      },
      global: { fetch: guardedFetch(options.fetch ?? ((input, init) => fetch(input, init))) },
    },
  )
}

let browserClient: OmniaSupabaseClient | undefined

export function getSupabaseClient(): OmniaSupabaseClient {
  browserClient ??= createBrowserSupabaseClient(getPublicEnv())
  return browserClient
}
