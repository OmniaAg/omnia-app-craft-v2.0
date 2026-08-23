import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { FieldError } from '../../crm/ui/CrmUi'
import { personalWorkFormSchema, type PersonalWorkFormValues } from '../model/schemas'

export function PersonalWorkForm({ onSubmit, pending, initialValues, submitLabel = 'Crear elemento personal' }: { onSubmit: (values: PersonalWorkFormValues) => Promise<void>; pending: boolean; initialValues?: PersonalWorkFormValues; submitLabel?: string }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PersonalWorkFormValues>({
    resolver: zodResolver(personalWorkFormSchema),
    defaultValues: initialValues ?? { itemType: 'todo', title: '', description: '', priority: 'normal', dueLocal: '' },
  })
  const submit = async (values: PersonalWorkFormValues) => { await onSubmit(values); reset() }
  return (
    <form className="crm-form" onSubmit={handleSubmit(submit)} noValidate>
      <div className="crm-form__row">
        <label>Tipo<select {...register('itemType')}><option value="todo">Pendiente</option><option value="note">Nota</option><option value="reminder">Recordatorio</option></select></label>
        <label>Prioridad<select {...register('priority')}><option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
      </div>
      <label>Título<input {...register('title')} autoComplete="off" aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'personal-title-error' : undefined} /></label>
      <FieldError id="personal-title-error" message={errors.title?.message} />
      <label>Detalle<textarea {...register('description')} rows={3} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'personal-description-error' : undefined} /></label>
      <FieldError id="personal-description-error" message={errors.description?.message} />
      <label>Fecha y hora (CDMX)<input {...register('dueLocal')} type="datetime-local" aria-invalid={Boolean(errors.dueLocal)} aria-describedby={errors.dueLocal ? 'personal-due-error' : undefined} /></label>
      <FieldError id="personal-due-error" message={errors.dueLocal?.message} />
      <button className="crm-button crm-button--primary" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Guardando…' : submitLabel}</button>
    </form>
  )
}
