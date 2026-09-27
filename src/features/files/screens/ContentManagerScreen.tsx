import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { useAuth } from '../../auth/context/AuthContext'
import { CrmPageHeader } from '../../crm/ui/CrmUi'
import { editorialTargetsQuery, fileKeys, fileProjectsQuery, filesQuery } from '../api/queries'
import { archiveFileAsset, FILE_PAGE_SIZE, linkContentAsset, permanentlyDeleteFileAsset, type FileAsset } from '../api/file-service'
import { FileActions } from '../ui/FileActions'
import { FileUploader } from '../ui/FileUploader'
import '../ui/files.css'
import '../../crm/ui/crm.css'

const statusLabels: Record<FileAsset['status'], string> = {
  pending: 'Pendiente', ready: 'Disponible', archived: 'Archivado', deleting: 'Eliminando', deleted: 'Eliminado',
}
function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}

function AssetRow({ asset, onChanged }: { asset: FileAsset; onChanged: () => void }) {
  const { hasCapability } = useAuth()
  const [itemId, setItemId] = useState('')
  const [showEditorial, setShowEditorial] = useState(false)
  const [targetSearch, setTargetSearch] = useState('')
  const [message, setMessage] = useState('')
  const targets = useQuery({ ...editorialTargetsQuery(asset.project_id, targetSearch), enabled: showEditorial })
  const archive = useMutation({ mutationFn: () => archiveFileAsset(getSupabaseClient(), asset.id), onSuccess: () => { setMessage('Archivo archivado.'); onChanged() } })
  const remove = useMutation({ mutationFn: () => permanentlyDeleteFileAsset(getSupabaseClient(), asset), onSuccess: () => { setMessage('Archivo eliminado permanentemente.'); onChanged() } })
  const link = useMutation({ mutationFn: () => linkContentAsset(getSupabaseClient(), itemId, asset.id), onSuccess: () => setMessage('Vinculado al contenido editorial.') })
  const busy = archive.isPending || remove.isPending || link.isPending
  return <li className="file-row">
    <div className="file-row-main"><strong>{asset.original_filename}</strong><span>{statusLabels[asset.status]}</span></div>
    <p>{asset.mime_type} · {fileSize(asset.size_bytes)} · {new Date(asset.created_at).toLocaleDateString('es-MX')}</p>
    <details><summary>Metadata</summary><dl><dt>Asset ID</dt><dd>{asset.id}</dd><dt>Proyecto</dt><dd>{asset.project_id}</dd><dt>Subido por</dt><dd>{asset.uploaded_by}</dd></dl></details>
    {asset.status === 'ready' || asset.status === 'archived' ? <FileActions asset={asset} /> : null}
    {asset.status === 'ready' ? <div className="file-row-controls">
      {!showEditorial ? <button type="button" className="crm-button" onClick={() => setShowEditorial(true)}>Vincular a editorial</button> : <div className="file-editorial-picker">
        <form onSubmit={(event) => {
          event.preventDefault()
          setItemId('')
          setTargetSearch(String(new FormData(event.currentTarget).get('targetSearch') ?? '').trim())
        }}><label>Buscar contenido<input name="targetSearch" type="search" autoComplete="off" /></label>
          <button type="submit" className="crm-button">Buscar</button></form>
        <label>Contenido editorial
          <select name="editorial_item" value={itemId} onChange={(event) => setItemId(event.target.value)} disabled={busy || targets.isPending}>
            <option value="">Selecciona contenido</option>
            {targets.data?.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <small>Se muestran hasta 100 resultados. Busca por título para encontrar otro contenido.</small>
      </div>}
      {showEditorial ? <button type="button" className="crm-button" disabled={!itemId || busy} onClick={() => link.mutate()}>Vincular</button> : null}
      {targets.error ? <p role="alert" className="file-error">{targets.error.message}</p> : null}
      {hasCapability('file.archive') ? <button type="button" className="crm-button" disabled={busy} onClick={() => archive.mutate()}>Archivar</button> : null}
    </div> : null}
    {hasCapability('file.delete_permanently') && (asset.status === 'ready' || asset.status === 'archived' || asset.status === 'deleting') ?
      <button type="button" className="crm-button file-delete" disabled={busy} onClick={() => {
        if (window.confirm(`¿Eliminar permanentemente “${asset.original_filename}”?`)) remove.mutate()
      }}>Eliminar permanentemente</button> : null}
    {message ? <p role="status" className="file-success">{message}</p> : null}
    {archive.error || remove.error || link.error ? <p role="alert" className="file-error">{(archive.error ?? remove.error ?? link.error)?.message}</p> : null}
  </li>
}

export function Component() {
  const [params, setParams] = useSearchParams()
  const projectId = params.get('project') ?? ''
  const status = params.get('status') ?? 'ready'
  const type = params.get('type') ?? 'all'
  const search = params.get('search') ?? ''
  const page = Math.min(10000, Math.max(0, Math.floor(Number(params.get('page') ?? '0') || 0)))
  const queryClient = useQueryClient()
  const projects = useQuery(fileProjectsQuery())
  const files = useQuery(filesQuery({ projectId, status, type, search, page }))
  const update = (name: string, value: string) => setParams((current) => {
    if (value) current.set(name, value); else current.delete(name)
    if (name !== 'page') current.delete('page')
    return current
  })
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: fileKeys.all }) }
  return <section className="crm-page files-page">
    <CrmPageHeader title="Content Manager" description="Archivos privados de proyectos autorizados." />
    <div className="files-toolbar">
      <label>Proyecto<select name="project" value={projectId} onChange={(event) => update('project', event.target.value)}>
        <option value="">Todos mis proyectos</option>
        {projects.data?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select></label>
      <label>Tipo<select name="type" value={type} onChange={(event) => update('type', event.target.value)}>
        <option value="all">Todos</option><option value="image">Imágenes</option><option value="video">Video</option><option value="document">Documentos</option>
      </select></label>
      <label>Estado<select name="status" value={status} onChange={(event) => update('status', event.target.value)}>
        <option value="ready">Disponibles</option><option value="archived">Archivados</option><option value="pending">Pendientes</option><option value="all">Todos</option>
      </select></label>
      <form className="files-search" onSubmit={(event) => {
        event.preventDefault()
        update('search', String(new FormData(event.currentTarget).get('search') ?? '').trim())
      }}><label>Buscar por nombre<input key={search} name="search" type="search" defaultValue={search} autoComplete="off" /></label>
        <button type="submit" className="crm-button">Buscar</button></form>
    </div>
    {projectId ? <section className="files-upload-section"><h2>Subir archivo</h2><FileUploader projectId={projectId} /></section> :
      <p>Selecciona un proyecto para subir un archivo.</p>}
    <section aria-labelledby="files-list-title"><h2 id="files-list-title">Archivos</h2>
      {files.isPending ? <p role="status">Cargando archivos…</p> : null}
      {files.error ? <p role="alert" className="file-error">{files.error.message}</p> : null}
      {projects.error ? <p role="alert" className="file-error">{projects.error.message}</p> : null}
      {files.data?.items.length === 0 ? <p>No hay archivos para estos filtros.</p> : null}
      {files.data?.items.length ? <ul className="file-list">{files.data.items.map((asset) => <AssetRow key={asset.id} asset={asset} onChanged={refresh} />)}</ul> : null}
      {files.data ? <nav className="files-pagination" aria-label="Páginas de archivos">
        <button type="button" disabled={page === 0} onClick={() => update('page', String(page - 1))}>Anterior</button>
        <span>Página {page + 1} de {Math.max(1, Math.ceil(files.data.total / FILE_PAGE_SIZE))}</span>
        <button type="button" disabled={(page + 1) * FILE_PAGE_SIZE >= files.data.total} onClick={() => update('page', String(page + 1))}>Siguiente</button>
      </nav> : null}
    </section>
  </section>
}
