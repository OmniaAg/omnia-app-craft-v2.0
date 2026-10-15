import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

getLocalSupabaseStatus()
mkdirSync('supabase/.temp/ux-refactor', {recursive:true})
const backup=execFileSync('docker',['exec','supabase_db_omnia-craft','pg_dump','-U','postgres','-d','postgres','--format=custom'],{maxBuffer:128*1024*1024})
writeFileSync('supabase/.temp/ux-refactor/before.dump',backup)
execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','migration','up','--local'],{stdio:'inherit'})
