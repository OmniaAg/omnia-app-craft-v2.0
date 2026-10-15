import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { fileKeys } from '../api/queries'
import { uploadFileAsset, type FileAsset } from '../api/file-service'
import { useUnsavedChanges } from '../../drafts/useUnsavedChanges'

export function FileUploader({ projectId, onUploaded }: { projectId: string; onUploaded?: (asset: FileAsset) => void }) {
  const [file, setFile] = useState<File | null>(null)
  useUnsavedChanges(`upload-${projectId}`, Boolean(file))
  const [inputKey, setInputKey] = useState(0)
  const [message, setMessage] = useState('')
  const queryClient = useQueryClient()
  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Selecciona un archivo.')
      return uploadFileAsset(getSupabaseClient(), projectId, file)
    },
    onSuccess: async (asset) => {
      setMessage('Archivo subido y disponible.')
      setFile(null)
      setInputKey((value) => value + 1)
      await queryClient.invalidateQueries({ queryKey: fileKeys.all })
      onUploaded?.(asset)
    },
  })
  const submit = (event: FormEvent) => { event.preventDefault(); upload.mutate() }
  return <form className="file-uploader" data-managed-changes onSubmit={submit}>
    <label htmlFor={`file-upload-${projectId}`}>Archivo para el proyecto</label>
    <input key={inputKey} id={`file-upload-${projectId}`} name="file" type="file" required disabled={upload.isPending}
      accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
      onChange={(event) => { setFile(event.target.files?.[0] ?? null); setMessage(''); upload.reset() }} />
    <p className="file-help">Imágenes, video, PDF y documentos Office · máximo 50 MiB.</p>
    <button className="crm-button crm-button--primary" type="submit" disabled={!file || upload.isPending}>
      {upload.isPending ? 'Subiendo y verificando…' : 'Subir archivo'}
    </button>
    {file && !upload.isPending ? <button type="button" className="crm-button" onClick={() => {
      setFile(null); setInputKey((value) => value + 1); setMessage('Selección cancelada.'); upload.reset()
    }}>Cancelar selección</button> : null}
    {upload.isPending ? <p role="status">Subiendo archivo privado…</p> : null}
    {upload.error ? <p role="alert" className="file-error">{upload.error.message}</p> : null}
    {message ? <p role="status" className="file-success">{message}</p> : null}
  </form>
}
