import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'

async function main() {
  const { status } = await waitForPostgrest()
  const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  
  await client.auth.signInWithPassword({ email: 'pm.scoped@omnia.local', password: 'test-password-123!' })
  
  const { data, error } = await client.rpc('has_capability', {
    capability_key: 'billing.create',
    agency_scope: '20000000-0000-0000-0000-000000000001',
    organization_scope: '30000000-0000-0000-0000-00000000000a'
  })
  
  console.log('has_capability returns:', data, error)
  
  const { data: myCaps, error: myCapsError } = await client.rpc('my_capabilities')
  console.log('my_capabilities error:', myCapsError)
  console.log('my_capabilities returns:', myCaps ? myCaps.filter(c => c.capability_key.includes('billing')) : myCaps)
}
main()
