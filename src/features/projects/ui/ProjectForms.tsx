import { submitForm } from '../../drafts/submitForm'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { useEffect } from 'react'
import type { ProjectBrandOption, ProjectMemberCandidate } from '../api/project-service'
import {
  milestoneFormSchema,
  projectFormSchema,
  projectMemberFormSchema,
  type MilestoneFormValues,
  type ProjectFormValues,
  type ProjectMemberFormValues,
} from '../model/schemas'
import { FieldError } from '../../crm/ui/CrmUi'

type AsyncFormProps<T> = {
  onSubmit: (values: T) => Promise<void>
  pending: boolean
}

export function ProjectForm({ brands, onSubmit, pending, initialValues, onDraftChange }: AsyncFormProps<ProjectFormValues> & { brands: ProjectBrandOption[]; initialValues?: ProjectFormValues; onDraftChange?: (value:ProjectFormValues)=>void }) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: initialValues ?? {
      brandId: brands[0]?.brand_id ?? '',
      name: '',
      description: '',
      status: 'planning',
      startDate: '',
      targetEndDate: '',
      timezone: brands[0]?.timezone ?? 'America/Mexico_City',
    },
  })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form
  const watched=useWatch({control:form.control})
  useEffect(()=>{if(onDraftChange&&JSON.stringify(form.getValues())!==JSON.stringify(initialValues))onDraftChange(form.getValues())},[form,initialValues,onDraftChange,watched])

  return (
    <form className="crm-form" data-server-draft={onDraftChange ? '' : undefined} onSubmit={handleSubmit(async values=>{try{await onSubmit(values)}catch{/* The parent renders command errors. */}})} noValidate>
      <fieldset className="form-fields" disabled={pending || isSubmitting}>
      <label>
        Organización y marca
        <select {...register('brandId')} aria-invalid={Boolean(errors.brandId)} aria-describedby={errors.brandId ? 'project-brand-error' : undefined}>
          <option value="">Selecciona una marca</option>
          {brands.map((brand) => (
            <option key={brand.brand_id} value={brand.brand_id}>{brand.organization_name} · {brand.brand_name}</option>
          ))}
        </select>
      </label>
      <FieldError id="project-brand-error" message={errors.brandId?.message} />
      <label>
        Nombre
        <input {...register('name')} autoComplete="off" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'project-name-error' : undefined} />
      </label>
      <FieldError id="project-name-error" message={errors.name?.message} />
      <label>Descripción<textarea {...register('description')} rows={4} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'project-description-error' : undefined} /></label>
      <FieldError id="project-description-error" message={errors.description?.message} />
      <div className="crm-form__row">
        <label>Estado inicial<select {...register('status')}><option value="planning">Planeación</option><option value="active">Activo</option><option value="on_hold">En pausa</option><option value="completed">Completado</option></select></label>
        <label>Zona horaria<input {...register('timezone')} autoComplete="off" spellCheck={false} aria-invalid={Boolean(errors.timezone)} aria-describedby={errors.timezone ? 'project-timezone-error' : undefined} /></label>
      </div>
      <FieldError id="project-timezone-error" message={errors.timezone?.message} />
      <div className="crm-form__row">
        <label>Inicio<input {...register('startDate')} type="date" /></label>
        <label>Fecha objetivo<input {...register('targetEndDate')} type="date" aria-invalid={Boolean(errors.targetEndDate)} aria-describedby={errors.targetEndDate ? 'project-target-error' : undefined} /></label>
      </div>
      <FieldError id="project-target-error" message={errors.targetEndDate?.message} />
      <button className="crm-button crm-button--primary" type="submit" disabled={pending || brands.length === 0} aria-busy={pending}>
        {pending ? 'Creando…' : 'Crear proyecto'}
      </button>
          </fieldset>
    </form>
  )
}

export function MilestoneForm({ onSubmit, pending }: AsyncFormProps<MilestoneFormValues>) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<MilestoneFormValues>({
    resolver: zodResolver(milestoneFormSchema),
    defaultValues: { name: '', description: '', dueDate: '', sortOrder: '0' },
  })
  const submit = async (values: MilestoneFormValues) => { await onSubmit(values); reset() }
  return (
    <form className="crm-form crm-form--compact" onSubmit={event => submitForm(event, handleSubmit, submit)} noValidate>
      <fieldset className="form-fields" disabled={pending || isSubmitting}>
      <label>Nombre del hito<input {...register('name')} autoComplete="off" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'milestone-name-error' : undefined} /></label>
      <FieldError id="milestone-name-error" message={errors.name?.message} />
      <label>Descripción<textarea {...register('description')} rows={3} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'milestone-description-error' : undefined} /></label>
      <FieldError id="milestone-description-error" message={errors.description?.message} />
      <div className="crm-form__row">
        <label>Fecha límite<input {...register('dueDate')} type="date" aria-invalid={Boolean(errors.dueDate)} aria-describedby={errors.dueDate ? 'milestone-due-error' : undefined} /></label>
        <label>Orden<input {...register('sortOrder')} type="number" min="0" step="1" inputMode="numeric" aria-invalid={Boolean(errors.sortOrder)} aria-describedby={errors.sortOrder ? 'milestone-order-error' : undefined} /></label>
      </div>
      <FieldError id="milestone-due-error" message={errors.dueDate?.message} />
      <FieldError id="milestone-order-error" message={errors.sortOrder?.message} />
      <button className="crm-button crm-button--primary" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Creando…' : 'Crear hito'}</button>
          </fieldset>
    </form>
  )
}

export function ProjectMemberForm({ candidates, onSubmit, pending }: AsyncFormProps<ProjectMemberFormValues> & { candidates: ProjectMemberCandidate[] }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProjectMemberFormValues>({
    resolver: zodResolver(projectMemberFormSchema), defaultValues: { userId: '' },
  })
  const submit = async (values: ProjectMemberFormValues) => { await onSubmit(values); reset() }
  return (
    <form className="crm-form crm-form--compact" onSubmit={event => submitForm(event, handleSubmit, submit)} noValidate>
      <fieldset className="form-fields" disabled={pending || isSubmitting}>
      <label>
        Persona
        <select {...register('userId')} aria-invalid={Boolean(errors.userId)} aria-describedby={errors.userId ? 'project-member-error' : undefined}>
          <option value="">Selecciona una persona</option>
          {candidates.map((candidate) => (
            <option key={candidate.user_id} value={candidate.user_id}>
              {candidate.display_name} · {candidate.member_type === 'client' ? 'Cliente' : candidate.suggested_responsibility === 'lead' ? 'Lead' : 'Miembro'}
            </option>
          ))}
        </select>
      </label>
      <FieldError id="project-member-error" message={errors.userId?.message} />
      <button className="crm-button crm-button--primary" type="submit" disabled={pending || candidates.length === 0} aria-busy={pending}>
        {pending ? 'Añadiendo…' : 'Añadir al proyecto'}
      </button>
          </fieldset>
    </form>
  )
}
