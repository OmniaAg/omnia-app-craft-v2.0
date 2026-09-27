import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { waitForPostgrest } from './lib/local-supabase.mjs'

const { status } = await waitForPostgrest()
if (new URL(status.API_URL).hostname !== '127.0.0.1') throw new Error('Local loopback only')
const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
function localRows(sql) {
  const output = execFileSync('docker', [
    'exec', 'supabase_db_omnia-craft', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql,
  ], { encoding: 'utf8' }).trim()
  return JSON.parse(output || '[]')
}
const projects = localRows("select coalesce(json_agg(json_build_object('id',id)),'[]'::json) from public.projects")
const assets = localRows("select coalesce(json_agg(json_build_object('id',id,'project_id',project_id,'object_path',object_path,'status',status,'created_at',created_at)),'[]'::json) from public.file_assets")
const objects = new Set()
const prefixes = new Set(projects.map((project) => project.id))
for (let offset = 0; ; offset += 100) {
  const { data, error } = await admin.storage.from('project-files').list('', { limit: 100, offset })
  if (error) throw error
  for (const entry of data) {
    if (entry.id) objects.add(entry.name)
    else prefixes.add(entry.name)
  }
  if (data.length < 100) break
}
for (const projectId of prefixes) {
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from('project-files').list(projectId, { limit: 100, offset })
    if (error) throw error
    for (const object of data) if (object.id) objects.add(`${projectId}/${object.name}`)
    if (data.length < 100) break
  }
}
const metadataPaths = new Set(assets.map((asset) => asset.object_path))
const stalePending = assets.filter((asset) => asset.status === 'pending' &&
  Date.now() - new Date(asset.created_at).getTime() > 60 * 60 * 1000)
const missingObjects = assets.filter((asset) => ['ready', 'archived', 'deleting'].includes(asset.status) && !objects.has(asset.object_path))
const orphanObjects = [...objects].filter((path) => !metadataPaths.has(path))
console.log(JSON.stringify({ stalePending, missingObjects, orphanObjects }, null, 2))
if (missingObjects.length || orphanObjects.length) process.exitCode = 1
