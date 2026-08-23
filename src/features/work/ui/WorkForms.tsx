import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { FieldError } from '../../crm/ui/CrmUi'
import type { ProjectMember, ProjectMilestone } from '../../projects/api/project-service'
import {
  assignmentFormSchema,
  commentFormSchema,
  workItemFormSchema,
  type AssignmentFormValues,
  type CommentFormValues,
  type WorkItemFormValues,
} from '../model/schemas'

type AsyncFormProps<T> = { onSubmit: (values: T) => Promise<void>; pending: boolean }

function AssigneeChoices({ members, register, invalid }: { members: ProjectMember[]; register: ReturnType<typeof useForm<WorkItemFormValues>>['register']; invalid: boolean }) {
  const internalMembers = members.filter((member) => member.status === 'active' && member.member_type === 'internal')
  return (
    <fieldset className="work-checklist" aria-invalid={invalid} aria-describedby={invalid ? 'work-assignees-error' : undefined}>
      <legend>Responsables iniciales</legend>
      {internalMembers.map((member) => (
        <label key={member.user_id}>
          <input {...register('assigneeIds')} type="checkbox" value={member.user_id} />
          <span>{member.display_name}</span>
        </label>
      ))}
      {internalMembers.length === 0 ? <p>No hay miembros internos disponibles.</p> : null}
    </fieldset>
  )
}

export function WorkItemForm({ members, milestones, onSubmit, pending }: AsyncFormProps<WorkItemFormValues> & { members: ProjectMember[]; milestones: ProjectMilestone[] }) {
  const form = useForm<WorkItemFormValues>({
    resolver: zodResolver(workItemFormSchema),
    defaultValues: { title: '', description: '', priority: 'normal', dueLocal: '', milestoneId: '', assigneeIds: [] },
  })
  const { register, handleSubmit, reset, formState: { errors } } = form
  const submit = async (values: WorkItemFormValues) => { await onSubmit(values); reset() }
  return (
    <form className="crm-form" onSubmit={handleSubmit(submit)} noValidate>
      <label>Título<input {...register('title')} autoComplete="off" aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'work-title-error' : undefined} /></label>
      <FieldError id="work-title-error" message={errors.title?.message} />
      <label>Descripción<textarea {...register('description')} rows={4} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'work-description-error' : undefined} /></label>
      <FieldError id="work-description-error" message={errors.description?.message} />
      <div className="crm-form__row">
        <label>Prioridad<select {...register('priority')}><option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
        <label>Hito<select {...register('milestoneId')}><option value="">Sin hito</option>{milestones.filter((item) => item.status !== 'archived').map((item) => <option key={item.milestone_id} value={item.milestone_id}>{item.milestone_name}</option>)}</select></label>
      </div>
      <label>Fecha y hora (CDMX)<input {...register('dueLocal')} type="datetime-local" aria-invalid={Boolean(errors.dueLocal)} aria-describedby={errors.dueLocal ? 'work-due-error' : undefined} /></label>
      <FieldError id="work-due-error" message={errors.dueLocal?.message} />
      <AssigneeChoices members={members} register={register} invalid={Boolean(errors.assigneeIds)} />
      <FieldError id="work-assignees-error" message={errors.assigneeIds?.message} />
      <button className="crm-button crm-button--primary" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Creando…' : 'Crear trabajo'}</button>
    </form>
  )
}

export function AssignmentForm({ members, currentIds, onSubmit, pending }: AsyncFormProps<AssignmentFormValues> & { members: ProjectMember[]; currentIds: string[] }) {
  const { register, handleSubmit, formState: { errors } } = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema), defaultValues: { assigneeIds: currentIds },
  })
  return (
    <form className="crm-form crm-form--compact" onSubmit={handleSubmit(onSubmit)} noValidate>
      <fieldset className="work-checklist" aria-invalid={Boolean(errors.assigneeIds)} aria-describedby={errors.assigneeIds ? 'assignment-error' : undefined}>
        <legend>Responsables</legend>
        {members.filter((member) => member.status === 'active' && member.member_type === 'internal').map((member) => (
          <label key={member.user_id}><input {...register('assigneeIds')} type="checkbox" value={member.user_id} /><span>{member.display_name}</span></label>
        ))}
      </fieldset>
      <FieldError id="assignment-error" message={errors.assigneeIds?.message} />
      <button className="crm-button" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Guardando…' : 'Guardar responsables'}</button>
    </form>
  )
}

export function CommentForm({ onSubmit, pending }: AsyncFormProps<CommentFormValues>) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CommentFormValues>({
    resolver: zodResolver(commentFormSchema), defaultValues: { body: '' },
  })
  const submit = async (values: CommentFormValues) => { await onSubmit(values); reset() }
  return (
    <form className="crm-form crm-form--compact" onSubmit={handleSubmit(submit)} noValidate>
      <label>Comentario<textarea {...register('body')} rows={3} aria-invalid={Boolean(errors.body)} aria-describedby={errors.body ? 'comment-error' : undefined} /></label>
      <FieldError id="comment-error" message={errors.body?.message} />
      <button className="crm-button crm-button--primary" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Publicando…' : 'Publicar comentario'}</button>
    </form>
  )
}
