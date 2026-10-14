import { readFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'
const status=getLocalSupabaseStatus()
const file=process.argv.includes('--test') ? 'supabase/.env.phase14-test.local' : 'supabase/.env.local'
const token=readFileSync(file,'utf8').match(/^PUSH_WORKER_TOKEN=(.+)$/m)?.[1]
if (!token) throw new Error('Configure PUSH_WORKER_TOKEN in the local server env file.')
const response=await fetch(`${status.API_URL}/functions/v1/push-api`,{method:'POST',headers:{apikey:status.PUBLISHABLE_KEY,
  'content-type':'application/json','x-push-worker-token':token},body:JSON.stringify({operation:'dispatch'})})
if (!response.ok) throw new Error(`Push dispatch failed: HTTP ${response.status}`)
console.log(await response.json())
