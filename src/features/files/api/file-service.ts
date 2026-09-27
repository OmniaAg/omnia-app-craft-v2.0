import type { OmniaSupabaseClient } from '../../../shared/api/supabase/client'
import type { Database } from '../../../shared/api/supabase/database.types'

export type FileAsset = Database['public']['Tables']['file_assets']['Row']
export type FileFilters = { projectId: string; status: string; type: string; search: string; page: number }
export const FILE_PAGE_SIZE = 20
export const FILE_MAX_BYTES = 50 * 1024 * 1024

const allowedTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

function failure(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback)
}

export async function listFileAssets(client: OmniaSupabaseClient, filters: FileFilters) {
  let query = client.from('file_assets').select('*', { count: 'exact' })
    .order('created_at', { ascending: false }).range(filters.page * FILE_PAGE_SIZE, (filters.page + 1) * FILE_PAGE_SIZE - 1)
  if (filters.projectId) query = query.eq('project_id', filters.projectId)
  if (filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.type === 'image') query = query.like('mime_type', 'image/%')
  if (filters.type === 'video') query = query.like('mime_type', 'video/%')
  if (filters.type === 'document') query = query.not('mime_type', 'like', 'image/%').not('mime_type', 'like', 'video/%')
  if (filters.search.trim()) query = query.ilike('original_filename', `%${filters.search.trim().slice(0, 100).replaceAll('%', '\\%').replaceAll('_', '\\_')}%`)
  const { data, count, error } = await query
  failure(error, 'No pudimos cargar los archivos.')
  return { items: data ?? [], total: count ?? 0 }
}

export async function listFileProjects(client: OmniaSupabaseClient) {
  const { data, error } = await client.from('projects').select('id,name').is('archived_at', null).order('name')
  failure(error, 'No pudimos cargar los proyectos.')
  return data ?? []
}

export async function uploadFileAsset(client: OmniaSupabaseClient, projectId: string, file: File): Promise<FileAsset> {
  if (!allowedTypes.has(file.type) || file.size < 1 || file.size > FILE_MAX_BYTES) {
    throw new Error('Elige un archivo permitido de hasta 50 MiB.')
  }
  const prepared = await client.rpc('prepare_file_asset', {
    project_id: projectId, original_filename: file.name, mime_type: file.type, size_bytes: file.size,
  })
  failure(prepared.error, 'No pudimos preparar el archivo.')
  if (!prepared.data) throw new Error('No pudimos preparar el archivo.')
  const asset = prepared.data
  const uploaded = await client.storage.from(asset.bucket_id).upload(asset.object_path, file, {
    contentType: file.type, upsert: false, cacheControl: '0',
  })
  failure(uploaded.error, 'La subida falló. El archivo pendiente no aparecerá como disponible.')
  const finalized = await client.rpc('finalize_file_asset', { asset_id: asset.id })
  failure(finalized.error, 'La subida llegó a Storage, pero falta finalizarla. Contacta a un administrador.')
  if (!finalized.data) throw new Error('No pudimos finalizar el archivo.')
  return finalized.data
}

export async function getPrivateBlob(client: OmniaSupabaseClient, asset: Pick<FileAsset, 'bucket_id' | 'object_path'>) {
  const { data, error } = await client.storage.from(asset.bucket_id).download(asset.object_path)
  failure(error, 'No pudimos descargar el archivo.')
  if (!data) throw new Error('No pudimos descargar el archivo.')
  return data
}

export async function downloadFileAsset(client: OmniaSupabaseClient, asset: Pick<FileAsset, 'bucket_id' | 'object_path' | 'original_filename'>) {
  const blob = await getPrivateBlob(client, asset)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = asset.original_filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export async function archiveFileAsset(client: OmniaSupabaseClient, id: string) {
  const { error } = await client.rpc('archive_file_asset', { asset_id: id })
  failure(error, 'No pudimos archivar el archivo.')
}

export async function permanentlyDeleteFileAsset(client: OmniaSupabaseClient, asset: FileAsset) {
  const prepared = await client.rpc('request_file_permanent_delete', { asset_id: asset.id })
  failure(prepared.error, 'No puedes eliminar este archivo permanentemente.')
  const removed = await client.storage.from(asset.bucket_id).remove([asset.object_path])
  failure(removed.error, 'No pudimos borrar el objeto. La solicitud queda pendiente para reintentar.')
  const confirmed = await client.rpc('confirm_file_permanent_delete', { asset_id: asset.id })
  failure(confirmed.error, 'El objeto se borró, pero falta confirmar la metadata. Reintenta la operación.')
}

export async function listVersionFiles(client: OmniaSupabaseClient, versionIds: string[]) {
  if (!versionIds.length) return []
  const { data, error } = await client.from('deliverable_files')
    .select('deliverable_version_id,ordinal,file_assets(*)').in('deliverable_version_id', versionIds)
    .order('ordinal')
  failure(error, 'No pudimos cargar los archivos de las versiones.')
  return data ?? []
}

export async function listReadyProjectFiles(client: OmniaSupabaseClient, projectId: string, search: string, page: number) {
  let query = client.from('file_assets').select('*', { count: 'exact' })
    .eq('project_id', projectId).eq('status', 'ready').order('created_at', { ascending: false })
    .range(page * FILE_PAGE_SIZE, (page + 1) * FILE_PAGE_SIZE - 1)
  if (search.trim()) query = query.ilike('original_filename', `%${search.trim().slice(0, 100).replaceAll('%', '\\%').replaceAll('_', '\\_')}%`)
  const { data, count, error } = await query
  failure(error, 'No pudimos cargar los archivos disponibles.')
  return { items: data ?? [], total: count ?? 0 }
}

export async function listEditorialFileTargets(client: OmniaSupabaseClient, projectId: string, search: string) {
  let query = client.from('editorial_items').select('id,title')
    .eq('project_id', projectId).is('archived_at', null).order('scheduled_date', { ascending: false }).limit(100)
  if (search.trim()) query = query.ilike('title', `%${search.trim().slice(0, 100).replaceAll('%', '\\%').replaceAll('_', '\\_')}%`)
  const { data, error } = await query
  failure(error, 'No pudimos cargar el contenido editorial.')
  return data ?? []
}

export async function linkContentAsset(client: OmniaSupabaseClient, itemId: string, assetId: string) {
  const { error } = await client.rpc('link_content_asset', { item_id: itemId, asset_id: assetId })
  failure(error, 'No pudimos vincular el archivo al contenido.')
}
