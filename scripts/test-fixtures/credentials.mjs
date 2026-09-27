import { createClient } from '@supabase/supabase-js'
import { getLocalSupabaseStatus, waitForPostgrest } from '../lib/local-supabase.mjs'

export const TEST_PASSWORD = 'OmniaTest!2026'

export const TEST_USERS = {
  director: ['10000000-0000-0000-0000-000000000001', 'director@omnia.local', 'agency_director'],
  pmBasic: ['10000000-0000-0000-0000-000000000002', 'pm.basic@omnia.local', 'project_manager'],
  pm: ['10000000-0000-0000-0000-000000000003', 'pm.scoped@omnia.local', 'project_manager'],
  contributor: ['10000000-0000-0000-0000-000000000004', 'contributor@omnia.local', 'contributor'],
  adminA: ['10000000-0000-0000-0000-000000000005', 'client.admin.a@omnia.local', 'client_admin'],
  reviewerA: ['10000000-0000-0000-0000-000000000006', 'client.reviewer.a@omnia.local', 'client_reviewer'],
  viewerA: ['10000000-0000-0000-0000-000000000007', 'client.viewer.a@omnia.local', 'client_viewer'],
  viewerB: ['10000000-0000-0000-0000-000000000008', 'client.user.b@omnia.local', 'client_viewer'],
  contributorB: ['10000000-0000-0000-0000-000000000011', 'contributor.b@omnia.local', 'contributor']
}

export async function setupTestCredentials() {
  const { status } = await waitForPostgrest(getLocalSupabaseStatus())
  
  // Production guard
  const apiUrl = new URL(status.API_URL)
  if (!['127.0.0.1', 'localhost'].includes(apiUrl.hostname)) {
    throw new Error('PRODUCTION GUARD: Refusing to set test credentials on a remote or non-local Supabase instance.')
  }

  const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
  
  console.log('Setting deterministic passwords for test fixtures...')
  for (const [id, email, role] of Object.values(TEST_USERS)) {
    const { error } = await admin.auth.admin.updateUserById(id, { 
      password: TEST_PASSWORD, 
      email_confirm: true 
    })
    if (error) {
      throw new Error(`Failed to set password for ${email}: ${error.message}`)
    }
  }
  console.log('Test credentials successfully configured.')
}
