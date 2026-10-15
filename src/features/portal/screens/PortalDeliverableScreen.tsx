import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { FileActions } from '../../files/ui/FileActions'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { portalKeys, portalQueries } from '../api/queries'
import { addClientFeedback, recordClientDecision } from '../api/portal-service'
import { PortalHeading, PortalState } from '../ui/PortalPrimitives'
import { formatPortalDate, statusLabel } from '../ui/portal-format'
import { useUnsavedChanges } from '../../drafts/useUnsavedChanges'

export function Component() {
  const { publicationId = '' } = useParams()
  const queryClient = useQueryClient()
  const query = useQuery({ ...portalQueries.deliverable(publicationId), enabled: Boolean(publicationId) })
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState('')
  const [notice, setNotice] = useState('')
  useUnsavedChanges('portal-feedback', Boolean(reason.trim() || feedback.trim()))
  const decisionRetry = useRef<{ signature: string; key: string } | null>(null)
  const feedbackRetry = useRef<{ body: string; key: string } | null>(null)
  const decide = useMutation({ mutationFn: async (decision: 'approve' | 'request_changes') => {
    const assignmentId = query.data?.my_assignment_id
    if (!assignmentId) throw new Error('No tienes una revisión asignada.')
    const signature = `${assignmentId}:${decision}:${reason.trim()}`
    if (decisionRetry.current?.signature !== signature) decisionRetry.current = { signature, key: crypto.randomUUID() }
    return recordClientDecision(getSupabaseClient(), assignmentId, decision, reason.trim(), decisionRetry.current.key)
  }, onSuccess: async () => {
    decisionRetry.current = null; setNotice('Tu decisión quedó registrada.'); setReason('')
    await queryClient.invalidateQueries({ queryKey: portalKeys.all })
  } })
  const comment = useMutation({ mutationFn: async () => {
    const body = feedback.trim()
    if (!body) throw new Error('Escribe un comentario antes de enviarlo.')
    if (feedbackRetry.current?.body !== body) feedbackRetry.current = { body, key: crypto.randomUUID() }
    return addClientFeedback(getSupabaseClient(), publicationId, body, feedbackRetry.current.key)
  }, onSuccess: async () => {
    feedbackRetry.current = null; setFeedback(''); setNotice('Tu comentario quedó registrado.')
    await queryClient.invalidateQueries({ queryKey: portalKeys.deliverable(publicationId) })
  } })
  const detail = query.data
  return <div className="portal-page"><Link className="portal-back" to={detail ? `/portal/projects/${detail.project_id}` : '/portal/projects'}>← Volver al proyecto</Link>
    <PortalState loading={query.isLoading} error={query.error}>
      {detail ? <><PortalHeading title={detail.title} description={`${detail.project_name} · ${detail.brand_name}`}>
        <span className="portal-badge">{statusLabel(detail.review_status)}</span></PortalHeading>
        <div className="portal-project-facts"><span>Versión publicada: {detail.version_number}</span>
          <span>Fecha de publicación: {formatPortalDate(detail.published_at)}</span></div>
        <section className="portal-section" aria-labelledby="portal-files-title"><h2 id="portal-files-title">Archivos de esta versión</h2>
          {detail.files.length ? <div className="portal-list">{detail.files.map(file =>
            <div className="portal-list__row" key={file.id}><div><strong>{file.original_filename}</strong>
              <p className="portal-list__detail">{file.mime_type} · {Math.ceil(file.size_bytes / 1024)} KB</p></div>
              <FileActions asset={file} /></div>)}</div> :
            <p className="portal-empty">Esta versión no incluye archivos adjuntos.</p>}</section>
        {detail.my_assignment_id && detail.my_assignment_status === 'pending' && detail.review_status === 'pending' ?
          <section className="portal-section portal-section--priority" aria-labelledby="portal-decision-title"><h2 id="portal-decision-title">Tu decisión</h2>
            <p>Revisa la versión y elige una acción. La decisión quedará en el historial.</p>
            <label className="portal-field">Motivo de los cambios (obligatorio al solicitar cambios)
              <textarea value={reason} maxLength={4000} rows={4} onChange={event => setReason(event.target.value)} /></label>
            <div className="portal-form-actions"><button className="portal-action" type="button" disabled={decide.isPending}
              onClick={() => decide.mutate('approve')}>Aprobar versión</button>
              <button className="portal-action portal-action--outline" type="button" disabled={decide.isPending || !reason.trim()}
                onClick={() => decide.mutate('request_changes')}>Solicitar cambios</button></div>
            {decide.error ? <p role="alert" className="portal-error">{decide.error.message}</p> : null}
          </section> : null}
        <section className="portal-section" aria-labelledby="portal-feedback-title"><h2 id="portal-feedback-title">Comentarios sobre esta versión</h2>
          {detail.feedback.length ? <ol className="portal-feedback-list">{detail.feedback.map(item =>
            <li key={item.id}><strong>{item.author_name}</strong><time>{formatPortalDate(item.created_at)}</time><p>{item.body}</p></li>)}</ol> :
            <p className="portal-empty">Todavía no hay comentarios.</p>}
          <form data-managed-changes onSubmit={event => { event.preventDefault(); comment.mutate() }}>
            <label className="portal-field">Escribe un comentario contextual
              <textarea value={feedback} maxLength={4000} rows={4} required onChange={event => setFeedback(event.target.value)} /></label>
            <button className="portal-action" disabled={comment.isPending || !feedback.trim()}>Enviar comentario</button>
            {comment.error ? <p role="alert" className="portal-error">{comment.error.message}</p> : null}
          </form></section>
        {notice ? <p role="status" className="portal-success">{notice}</p> : null}
      </> : null}
    </PortalState></div>
}
