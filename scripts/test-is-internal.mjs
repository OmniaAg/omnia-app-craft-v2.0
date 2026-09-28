import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'

async function main() {
  const { status } = await waitForPostgrest()
  const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  
  const { data: authData, error: authError } = await client.auth.signInWithPassword({ email: 'pm.scoped@omnia.local', password: 't3st-P4ssw0rd-!!' })
  if (authError) {
    console.error('Login failed!', authError)
    return
  }
  console.log('Logged in!', authData.user?.id)
  
  const { data, error } = await client.rpc('is_internal_actor')
  console.log('is_internal_actor returns:', data, error)
}
main()
