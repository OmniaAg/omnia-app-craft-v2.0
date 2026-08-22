import { describe, expect, it } from 'vitest'
import { getSupabaseClient } from '../shared/api/supabase/client'
import { checkSupabaseConnection } from '../shared/api/supabase/health'

describe('local Supabase connectivity', () => {
  it('reaches the generated health RPC through the browser client', async () => {
    await expect(checkSupabaseConnection(getSupabaseClient())).resolves.toEqual({
      status: 'ok',
    })
  })
})
