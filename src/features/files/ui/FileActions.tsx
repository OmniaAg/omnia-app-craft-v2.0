import { useEffect, useState } from 'react'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { downloadFileAsset, getPrivateBlob, type FileAsset } from '../api/file-service'

export function FileActions({ asset }: { asset: Pick<FileAsset, 'bucket_id' | 'object_path' | 'original_filename' | 'mime_type'> }) {
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
  const download = async () => {
    setBusy(true); setError('')
    try { await downloadFileAsset(getSupabaseClient(), asset) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos descargar el archivo.') }
    finally { setBusy(false) }
  }
  const preview = async () => {
    setBusy(true); setError('')
    try { setPreviewUrl(URL.createObjectURL(await getPrivateBlob(getSupabaseClient(), asset))) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos abrir la vista previa.') }
    finally { setBusy(false) }
  }
  return <div className="file-actions">
    <button type="button" className="crm-row-link" aria-label={`Descargar ${asset.original_filename}`} disabled={busy} onClick={download}>Descargar</button>
    {asset.mime_type.startsWith('image/') || asset.mime_type === 'application/pdf' ?
      <button type="button" className="crm-row-link" aria-label={`Vista previa de ${asset.original_filename}`} disabled={busy} onClick={preview}>Vista previa</button> : null}
    {error ? <span role="alert" className="file-error">{error}</span> : null}
    {previewUrl ? <div className="file-preview"><button type="button" onClick={() => setPreviewUrl('')}>Cerrar vista previa</button>
      {asset.mime_type.startsWith('image/') ? <img src={previewUrl} width={720} height={540} alt={`Vista previa de ${asset.original_filename}`} /> :
        <iframe src={previewUrl} sandbox="" title={`Vista previa de ${asset.original_filename}`} />}
    </div> : null}
  </div>
}
