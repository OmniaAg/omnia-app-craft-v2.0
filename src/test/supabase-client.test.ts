import { describe, expect, it, vi } from 'vitest'
import { createBrowserSupabaseClient } from '../shared/api/supabase/client'
import { checkSupabaseConnection } from '../shared/api/supabase/health'
import { parsePublicEnv } from '../shared/config/env'

describe('Supabase browser adapter', () => {
  it('uses the typed health RPC with the configured local endpoint and key', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )
    const environment = parsePublicEnv({
      VITE_APP_URL: 'http://localhost:53170',
      VITE_SUPABASE_URL: 'http://127.0.0.1:56321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_test',
    })
    const client = createBrowserSupabaseClient(environment, {
      fetch: request,
      persistSession: false,
    })

    await expect(checkSupabaseConnection(client)).resolves.toEqual({
      status: 'ok',
    })

    const [url, init] = request.mock.calls[0]
    expect(String(url)).toBe('http://127.0.0.1:56321/rest/v1/rpc/health_check')
    expect(new Headers(init?.headers).get('apikey')).toBe(
      'sb_publishable_local_test',
    )
  })

  it('surfaces an invalid diagnostic response', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'degraded' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )
    const client = createBrowserSupabaseClient(
      parsePublicEnv({
        VITE_APP_URL: 'http://localhost:53170',
        VITE_SUPABASE_URL: 'http://127.0.0.1:56321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_test',
      }),
      { fetch: request, persistSession: false },
    )

    await expect(checkSupabaseConnection(client)).rejects.toThrow(
      /diagnóstico inválido/,
    )
  })
})
