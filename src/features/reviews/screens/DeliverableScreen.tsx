import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { useAuth } from '../../auth/context/AuthContext'
import { CrmError, CrmPageHeader, CrmSuccess, StatusBadge } from '../../crm/ui/CrmUi'
import { workKeys } from '../../work/api/queries'
import { deliverableDetailQuery, reviewKeys } from '../api/queries'
import { createDeliverable, overrideRequirement, publishDeliverable, recordDecision, submitVersion,
  type ReviewAssignment, type ReviewVersion } from '../api/review-service'
import '../ui/reviews.css'
import '../../crm/ui/crm.css'

const dateTime = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City',
})

function CreateForm({ pending, onCreate }: { pending: boolean; onCreate: (title: string, key: string) => Promise<unknown> }) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const key = useRef<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) { setError('Escribe un título.'); return }
    try { await onCreate(title.trim(), key.current ??= crypto.randomUUID()); key.current = null }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos crear la entrega.') }
  }
  return <form className="review-form" onSubmit={submit}>
    <h2>Crear entrega</h2>
    <label htmlFor="deliverable-title">Título</label>
    <input id="deliverable-title" value={title} required maxLength={240} disabled={pending}
      onChange={(event) => { setTitle(event.target.value); setError(''); key.current = null }} />
    {error ? <CrmError message={error} /> : null}
    <button className="crm-button crm-button--primary" type="submit" disabled={pending}>{pending ? 'Creando…' : 'Crear entrega'}</button>
  </form>
}

function SubmissionForm({ pending, onSubmit }: { pending: boolean; onSubmit: (notes: string, key: string) => Promise<unknown> }) {
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const key = useRef<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!notes.trim()) { setError('Describe lo que entregas en esta versión.'); return }
    try { await onSubmit(notes.trim(), key.current ??= crypto.randomUUID()); key.current = null; setNotes('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos enviar la versión.') }
  }
  return <form className="review-form" onSubmit={submit}>
    <h2>Enviar nueva versión</h2>
    <label htmlFor="version-notes">Notas de entrega</label>
    <textarea id="version-notes" value={notes} required maxLength={12000} rows={5} disabled={pending}
      onChange={(event) => { setNotes(event.target.value); setError(''); key.current = null }} />
    <p>El contenido enviado quedará en el historial de versiones.</p>
    {error ? <CrmError message={error} /> : null}
    <button className="crm-button crm-button--primary" type="submit" disabled={pending}>{pending ? 'Enviando…' : 'Enviar a revisión'}</button>
  </form>
}

function DecisionForm({ assignment, pending, onDecide }: {
  assignment: ReviewAssignment; pending: boolean
  onDecide: (decision: 'approve' | 'request_changes', reason: string, key: string) => Promise<unknown>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const key = useRef<string | null>(null)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const decision = button?.value === 'request_changes' ? 'request_changes' : 'approve'
    if (decision === 'request_changes' && !reason.trim()) { setError('Explica los cambios solicitados.'); return }
    try { await onDecide(decision, reason.trim(), key.current ??= crypto.randomUUID()); key.current = null }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar tu decisión.') }
  }
  return <form className="review-form" onSubmit={submit}>
    <h4>Tu decisión</h4>
    <label htmlFor={`decision-reason-${assignment.id}`}>Comentario o cambios solicitados</label>
    <textarea id={`decision-reason-${assignment.id}`} value={reason} maxLength={4000} rows={3} disabled={pending}
      onChange={(event) => { setReason(event.target.value); setError(''); key.current = null }} />
    {error ? <CrmError message={error} /> : null}
    <div className="review-actions">
      <button className="crm-button crm-button--primary" type="submit" value="approve" disabled={pending}>Aprobar</button>
      <button className="crm-button" type="submit" value="request_changes" disabled={pending}>Pedir cambios</button>
    </div>
  </form>
}

function OverrideForm({ assignment, pending, onOverride }: {
  assignment: ReviewAssignment; pending: boolean; onOverride: (reason: string, key: string) => Promise<unknown>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const key = useRef<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) { setError('La razón de la excepción es obligatoria.'); return }
    try { await onOverride(reason.trim(), key.current ??= crypto.randomUUID()); key.current = null }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos registrar la excepción.') }
  }
  return <form className="review-form review-form--override" onSubmit={submit}>
    <h4>Omitir reviewer requerido</h4>
    <p>Excepción de Dirección auditada. Se conservarán el requisito y el reviewer omitidos.</p>
    <label htmlFor={`override-reason-${assignment.id}`}>Razón obligatoria</label>
    <textarea id={`override-reason-${assignment.id}`} value={reason} required maxLength={4000} rows={3} disabled={pending}
      onChange={(event) => { setReason(event.target.value); setError(''); key.current = null }} />
    {error ? <CrmError message={error} /> : null}
    <button className="crm-button" type="submit" disabled={pending}>Registrar excepción</button>
  </form>
}

function VersionCard({ version, actorId, canOverride, pending, decide, override }: {
  version: ReviewVersion; actorId: string | undefined; canOverride: boolean; pending: boolean
  decide: (assignmentId: string, decision: 'approve' | 'request_changes', reason: string, key: string) => Promise<unknown>
  override: (assignmentId: string, reason: string, key: string) => Promise<unknown>
}) {
  return <li className="review-version">
    <header><h3>Versión {version.version_number}</h3><StatusBadge value={version.round.status} /></header>
    <p className="review-meta">{version.submitter_name} · <time dateTime={version.submitted_at}>{dateTime.format(new Date(version.submitted_at))}</time></p>
    <p className="review-notes">{version.notes}</p>
    <h4>Revisión interna</h4>
    <ul className="review-assignees">
      {version.round.assignments.map((assignment) => <li key={assignment.id}>
        <div className="review-assignee-heading"><strong>{assignment.reviewer_name}</strong><StatusBadge value={assignment.status} /></div>
        <p className="review-meta">Requisito {assignment.requirement_scope === 'project' ? 'del proyecto' : 'de esta entrega'}</p>
        {assignment.decision ? <p>{assignment.decision === 'approve' ? 'Aprobó' : 'Pidió cambios'}{assignment.reason ? `: ${assignment.reason}` : ''}</p> : null}
        {assignment.override_reason ? <p className="review-exception">Excepción auditada: {assignment.override_reason}</p> : null}
        {assignment.status === 'pending' && version.round.status === 'pending' && actorId === assignment.reviewer_id
          && actorId !== version.submitted_by ? <DecisionForm assignment={assignment} pending={pending}
            onDecide={(decision, reason, key) => decide(assignment.id, decision, reason, key)} /> : null}
        {assignment.status === 'pending' && version.round.status === 'pending' && canOverride ?
          <OverrideForm assignment={assignment} pending={pending} onOverride={(reason, key) => override(assignment.id, reason, key)} /> : null}
      </li>)}
    </ul>
  </li>
}

export function Component() {
  const { workItemId = '' } = useParams()
  const actorId = useAuth().actor?.user.id
  const queryClient = useQueryClient()
  const [success, setSuccess] = useState('')
  const detail = useQuery(deliverableDetailQuery(workItemId))
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: reviewKeys.detail(workItemId) }),
      queryClient.invalidateQueries({ queryKey: reviewKeys.queueRoot() }),
      queryClient.invalidateQueries({ queryKey: workKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['my-space'] }),
    ])
  }
  const create = useMutation({
    mutationFn: ({ title, key }: { title: string; key: string }) => createDeliverable(getSupabaseClient(), workItemId, title, key),
    onSuccess: async () => { await refresh(); setSuccess('Entrega creada.') },
  })
  const submit = useMutation({
    mutationFn: ({ id, notes, key }: { id: string; notes: string; key: string }) => submitVersion(getSupabaseClient(), id, notes, key),
    onSuccess: async () => { await refresh(); setSuccess('Versión enviada a revisión.') },
  })
  const decision = useMutation({
    mutationFn: ({ id, value, reason, key }: { id: string; value: 'approve' | 'request_changes'; reason: string; key: string }) =>
      recordDecision(getSupabaseClient(), id, value, reason, key),
    onSuccess: async () => { await refresh(); setSuccess('Decisión registrada.') },
  })
  const override = useMutation({
    mutationFn: ({ id, reason, key }: { id: string; reason: string; key: string }) => overrideRequirement(getSupabaseClient(), id, reason, key),
    onSuccess: async () => { await refresh(); setSuccess('Excepción auditada registrada.') },
  })
  const publish = useMutation({
    mutationFn: ({ id, key }: { id: string; key: string }) => publishDeliverable(getSupabaseClient(), id, key),
    onSuccess: async () => { await refresh(); setSuccess('Publicación registrada.') },
  })
  const publishKey = useRef<string | null>(null)
  const data = detail.data
  const pending = create.isPending || submit.isPending || decision.isPending || override.isPending || publish.isPending
  return <section className="crm-page reviews-page">
    {data ? <Link className="crm-back-link" to={`/app/projects/${data.work.project_id}?tab=work&workItem=${workItemId}`}>← Volver al trabajo</Link> : null}
    <CrmPageHeader title={data?.deliverable?.title ?? data?.work.title ?? 'Entrega'} description={data ? `Trabajo: ${data.work.title}` : 'Historial de entrega y revisión interna'} />
    {detail.isPending ? <p role="status">Cargando entrega…</p> : null}
    {detail.error ? <CrmError message={detail.error.message} /> : null}
    {success ? <CrmSuccess message={success} /> : null}
    {data ? <>
      <div className="review-summary"><StatusBadge value={data.deliverable?.status ?? 'draft'} />
        <span>Trabajo: <StatusBadge value={data.work.status} /></span>
        <Link className="crm-row-link" to={`/app/projects/${data.work.project_id}/reviews${data.deliverable ? `?deliverableId=${data.deliverable.id}` : ''}`}>Configurar reviewers</Link>
      </div>
      {data.can_create ? <CreateForm pending={pending} onCreate={(title, key) => create.mutateAsync({ title, key })} /> : null}
      {data.can_submit && data.deliverable ? <SubmissionForm pending={pending}
        onSubmit={(notes, key) => submit.mutateAsync({ id: data.deliverable!.id, notes, key })} /> : null}
      {data.can_publish && data.deliverable ? <section className="review-publish" aria-labelledby="review-publish-title">
        <h2 id="review-publish-title">Revisión interna completa</h2><p>La versión aprobada está lista para publicar al cliente.</p>
        <button className="crm-button crm-button--primary" type="button" disabled={pending}
          onClick={() => publish.mutate({ id: data.deliverable!.id, key: publishKey.current ??= crypto.randomUUID() })}>Publicar entrega</button>
      </section> : null}
      <section aria-labelledby="review-history-title"><h2 id="review-history-title">Historial de versiones</h2>
        {data.versions.length === 0 ? <p>La primera versión aún no se ha enviado.</p> : null}
        <ol className="review-history">{data.versions.map((version) => <VersionCard key={version.id} version={version}
          actorId={actorId} canOverride={data.can_override} pending={pending}
          decide={(id, value, reason, key) => decision.mutateAsync({ id, value, reason, key })}
          override={(id, reason, key) => override.mutateAsync({ id, reason, key })} />)}</ol>
      </section>
    </> : null}
  </section>
}
