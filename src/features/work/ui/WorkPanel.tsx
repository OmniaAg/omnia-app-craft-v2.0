import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { CrmError, CrmSuccess, StatusBadge } from '../../crm/ui/CrmUi'
import type { ProjectMember } from '../../projects/api/project-service'
import {
  archiveWorkItem,
  assignWorkItem,
  createWorkComment,
  transitionWorkItem,
  type ProjectWorkItem,
} from '../api/work-service'
import { workCommentsQuery, workEventsQuery, workKeys } from '../api/queries'
import type { AssignmentFormValues, CommentFormValues } from '../model/schemas'
import { AssignmentForm, CommentForm } from './WorkForms'

const dateTime = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City',
})

const transitionOptions: Record<string, { value: string; label: string }[]> = {
  todo: [{ value: 'in_progress', label: 'Iniciar' }, { value: 'cancelled', label: 'Cancelar' }],
  in_progress: [{ value: 'todo', label: 'Volver a todo' }, { value: 'blocked', label: 'Bloquear' }, { value: 'done', label: 'Completar' }, { value: 'cancelled', label: 'Cancelar' }],
  blocked: [{ value: 'in_progress', label: 'Desbloquear' }, { value: 'cancelled', label: 'Cancelar' }],
  done: [{ value: 'in_progress', label: 'Reabrir' }],
  cancelled: [{ value: 'todo', label: 'Restaurar a todo' }],
}

const eventLabels: Record<string, string> = {
  'work.created': 'Trabajo creado',
  'work.assigned': 'Responsables asignados',
  'work.reassigned': 'Responsables actualizados',
  'work.status_changed': 'Estado actualizado',
  'work.completed': 'Trabajo completado',
  'work.comment.created': 'Comentario publicado',
  'work.archived': 'Trabajo archivado',
}

export function WorkPanel({ projectId, item, members, onClose }: { projectId: string; item: ProjectWorkItem; members: ProjectMember[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const comments = useQuery(workCommentsQuery(item.work_item_id))
  const events = useQuery(workEventsQuery(item.work_item_id))

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.scrollIntoView?.({ block: 'start' })
  }, [item.work_item_id])

  const refreshWork = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: workKeys.project(projectId) }),
      queryClient.invalidateQueries({ queryKey: ['my-space'] }),
    ])
  }
  const transitionMutation = useMutation({
    mutationFn: (status: string) => transitionWorkItem(getSupabaseClient(), item.work_item_id, status),
    onMutate: () => setFeedback(null),
    onSuccess: async () => { await refreshWork(); setFeedback('Estado actualizado.') },
  })
  const assignmentMutation = useMutation({
    mutationFn: (values: AssignmentFormValues) => assignWorkItem(getSupabaseClient(), item.work_item_id, values.assigneeIds),
    onMutate: () => setFeedback(null),
    onSuccess: async () => {
      await refreshWork()
      await queryClient.invalidateQueries({ queryKey: workKeys.events(item.work_item_id) })
      setFeedback('Responsables guardados.')
    },
  })
  const commentMutation = useMutation({
    mutationFn: (values: CommentFormValues) => createWorkComment(getSupabaseClient(), item.work_item_id, values),
    onMutate: () => setFeedback(null),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workKeys.comments(item.work_item_id) }),
        queryClient.invalidateQueries({ queryKey: workKeys.events(item.work_item_id) }),
      ])
      setFeedback('Comentario publicado.')
    },
  })
  const archiveMutation = useMutation({
    mutationFn: () => archiveWorkItem(getSupabaseClient(), item.work_item_id),
    onMutate: () => setFeedback(null),
    onSuccess: async () => { await refreshWork(); onClose() },
  })
  const mutationError = transitionMutation.error ?? assignmentMutation.error ?? commentMutation.error ?? archiveMutation.error

  return (
    <aside className="work-panel" aria-labelledby="work-panel-title">
      <header className="work-panel__header">
        <div>
          <h2 id="work-panel-title" ref={headingRef} tabIndex={-1}>{item.title}</h2>
          <div className="work-panel__badges"><StatusBadge value={item.status} /><StatusBadge value={item.priority} /></div>
        </div>
        <button className="crm-button" type="button" onClick={onClose}>Cerrar detalle</button>
      </header>
      {item.description ? <p className="work-panel__description">{item.description}</p> : null}
      <dl className="work-facts">
        <div><dt>Responsables</dt><dd>{item.assignee_names.length ? item.assignee_names.join(', ') : 'Sin responsables'}</dd></div>
        <div><dt>Hito</dt><dd>{item.milestone_name || 'Sin hito'}</dd></div>
        <div><dt>Vence</dt><dd>{item.due_at ? dateTime.format(new Date(item.due_at)) : 'Sin fecha'}</dd></div>
      </dl>
      {!item.archived_at ? <Link className="crm-row-link" to={`/app/deliverables/${item.work_item_id}`}>Abrir entrega y revisiones</Link> : null}
      {mutationError ? <CrmError message={mutationError.message} /> : null}
      {feedback ? <CrmSuccess message={feedback} /> : null}
      {item.can_transition && !item.archived_at ? (
        <section className="work-panel__section" aria-labelledby="work-transition-title">
          <h3 id="work-transition-title">Cambiar estado</h3>
          <div className="work-actions">
            {(transitionOptions[item.status] ?? []).map((option) => (
              <button className="crm-button" type="button" key={option.value} disabled={transitionMutation.isPending} aria-busy={transitionMutation.isPending} onClick={() => transitionMutation.mutate(option.value)}>{transitionMutation.isPending ? 'Actualizando…' : option.label}</button>
            ))}
          </div>
        </section>
      ) : null}
      {item.can_assign && !item.archived_at ? (
        <section className="work-panel__section" aria-labelledby="work-assignment-title">
          <h3 id="work-assignment-title">Asignación</h3>
          <AssignmentForm key={item.assignee_ids.join(':')} members={members} currentIds={item.assignee_ids} pending={assignmentMutation.isPending} onSubmit={(values) => assignmentMutation.mutateAsync(values).then(() => undefined)} />
        </section>
      ) : null}
      <section className="work-panel__section" aria-labelledby="work-comments-title">
        <h3 id="work-comments-title">Comentarios</h3>
        <CommentForm pending={commentMutation.isPending} onSubmit={(values) => commentMutation.mutateAsync(values).then(() => undefined)} />
        {comments.error ? <CrmError message={comments.error.message} /> : null}
        {comments.isPending ? <p role="status">Cargando comentarios…</p> : null}
        <ol className="work-comment-list">
          {comments.data?.map((comment) => (
            <li key={comment.comment_id}>
              <div><strong>{comment.author_name}</strong><time dateTime={comment.created_at}>{dateTime.format(new Date(comment.created_at))}</time></div>
              <p>{comment.body}</p>
            </li>
          ))}
        </ol>
        {!comments.isPending && comments.data?.length === 0 ? <p className="work-muted">Todavía no hay comentarios.</p> : null}
      </section>
      <section className="work-panel__section" aria-labelledby="work-history-title">
        <h3 id="work-history-title">Historial</h3>
        {events.error ? <CrmError message={events.error.message} /> : null}
        {events.isPending ? <p role="status">Cargando historial…</p> : null}
        <ol className="work-event-list">
          {events.data?.map((event) => (
            <li key={event.event_id}><span>{eventLabels[event.event_type] ?? event.event_type}</span><small>{event.actor_name} · <time dateTime={event.occurred_at}>{dateTime.format(new Date(event.occurred_at))}</time></small></li>
          ))}
        </ol>
      </section>
      {item.can_archive && !item.archived_at ? (
        <button className="work-danger-action" type="button" disabled={archiveMutation.isPending} onClick={() => { if (window.confirm(`¿Archivar “${item.title}”?`)) archiveMutation.mutate() }}>
          {archiveMutation.isPending ? 'Archivando…' : 'Archivar trabajo'}
        </button>
      ) : null}
    </aside>
  )
}
