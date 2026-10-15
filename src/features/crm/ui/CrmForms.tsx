import { submitForm } from '../../drafts/submitForm'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { Brand, Organization, PipelineStage } from '../api/crm-service'
import {
  activityFormSchema,
  brandFormSchema,
  contactFormSchema,
  opportunityFormSchema,
  organizationFormSchema,
  type ActivityFormValues,
  type BrandFormValues,
  type ContactFormValues,
  type OpportunityFormValues,
  type OrganizationFormValues,
} from '../model/schemas'
import { FieldError } from './CrmUi'

type FormProps<T> = {
  onSubmit: (values: T) => Promise<void>
  pending: boolean
  submitLabel: string
}

export function OrganizationForm({ organization, onSubmit, pending, submitLabel }: FormProps<OrganizationFormValues> & { organization?: Organization }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: {
      name: organization?.name ?? '',
      domain: organization?.domain ?? '',
      timezone: organization?.timezone ?? 'America/Mexico_City',
      lifecycle: (organization?.lifecycle as OrganizationFormValues['lifecycle']) ?? 'prospect',
    },
  })
  return (
    <form className="crm-form" onSubmit={event => submitForm(event, handleSubmit, onSubmit)} noValidate>
      <fieldset className="form-fields" disabled={pending || isSubmitting}>
      <label>Nombre<input {...register('name')} autoComplete="off" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'organization-name-error' : undefined} /></label>
      <FieldError id="organization-name-error" message={errors.name?.message} />
      <label>Dominio<input {...register('domain')} placeholder="Ejemplo: empresa.com…" inputMode="url" autoComplete="off" spellCheck={false} aria-invalid={Boolean(errors.domain)} aria-describedby={errors.domain ? 'organization-domain-error' : undefined} /></label>
      <FieldError id="organization-domain-error" message={errors.domain?.message} />
      <label>Timezone<input {...register('timezone')} autoComplete="off" spellCheck={false} /></label>
      {organization ? (
        <label>Lifecycle<select {...register('lifecycle')}>
          <option value="prospect">Prospect</option>
          {organization.lifecycle !== 'prospect' ? <option value="active_client">Active client</option> : null}
          <option value="inactive">Inactive</option>
        </select></label>
      ) : <input type="hidden" {...register('lifecycle')} />}
      <button className="crm-button crm-button--primary" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Guardando…' : submitLabel}</button>
          </fieldset>
    </form>
  )
}

export function BrandForm({ onSubmit, pending, submitLabel }: FormProps<BrandFormValues>) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<BrandFormValues>({
    resolver: zodResolver(brandFormSchema), defaultValues: { name: '', timezone: '' },
  })
  const submit = async (values: BrandFormValues) => { await onSubmit(values); reset() }
  return (
    <form className="crm-form crm-form--compact" onSubmit={event => submitForm(event, handleSubmit, submit)} noValidate>
      <fieldset className="form-fields" disabled={pending || isSubmitting}>
      <label>Nombre de marca<input {...register('name')} autoComplete="off" aria-invalid={Boolean(errors.name)} /></label>
      <FieldError id="brand-name-error" message={errors.name?.message} />
      <label>Timezone opcional<input {...register('timezone')} placeholder="Hereda de la organización…" autoComplete="off" spellCheck={false} /></label>
      <button className="crm-button crm-button--primary" type="submit" disabled={pending}>{pending ? 'Creando…' : submitLabel}</button>
          </fieldset>
    </form>
  )
}

export function ContactForm({ onSubmit, pending, submitLabel }: FormProps<ContactFormValues>) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { fullName: '', email: '', phone: '', jobTitle: '', notes: '' },
  })
  const submit = async (values: ContactFormValues) => { await onSubmit(values); reset() }
  return (
    <form className="crm-form" onSubmit={event => submitForm(event, handleSubmit, submit)} noValidate>
      <fieldset className="form-fields" disabled={pending || isSubmitting}>
      <label>Nombre completo<input {...register('fullName')} autoComplete="off" aria-invalid={Boolean(errors.fullName)} /></label>
      <FieldError id="contact-name-error" message={errors.fullName?.message} />
      <div className="crm-form__row">
        <label>Correo<input {...register('email')} type="email" autoComplete="email" spellCheck={false} aria-invalid={Boolean(errors.email)} /></label>
        <label>Teléfono<input {...register('phone')} type="tel" autoComplete="tel" /></label>
      </div>
      <FieldError id="contact-email-error" message={errors.email?.message} />
      <label>Puesto<input {...register('jobTitle')} autoComplete="off" /></label>
      <label>Notas internas<textarea {...register('notes')} rows={3} /></label>
      <button className="crm-button crm-button--primary" type="submit" disabled={pending}>{pending ? 'Creando…' : submitLabel}</button>
          </fieldset>
    </form>
  )
}

export function OpportunityForm({ brands, stages, onSubmit, pending, submitLabel }: FormProps<OpportunityFormValues> & { brands: Brand[]; stages: PipelineStage[] }) {
  const initialStage = stages.find((stage) => stage.outcome === 'open')?.key ?? 'lead'
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<OpportunityFormValues>({
    resolver: zodResolver(opportunityFormSchema),
    defaultValues: { name: '', brandId: '', stageKey: initialStage, estimatedValue: '', currency: 'MXN', expectedCloseDate: '' },
  })
  const submit = async (values: OpportunityFormValues) => { await onSubmit(values); reset({ name: '', brandId: '', stageKey: initialStage, estimatedValue: '', currency: 'MXN', expectedCloseDate: '' }) }
  return (
    <form className="crm-form" onSubmit={event => submitForm(event, handleSubmit, submit)} noValidate>
      <fieldset className="form-fields" disabled={pending || isSubmitting}>
      <label>Oportunidad<input {...register('name')} autoComplete="off" aria-invalid={Boolean(errors.name)} /></label>
      <FieldError id="opportunity-name-error" message={errors.name?.message} />
      <div className="crm-form__row">
        <label>Marca<select {...register('brandId')}><option value="">Sin marca específica</option>{brands.filter((brand) => brand.status === 'active').map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}</select></label>
        <label>Etapa<select {...register('stageKey')}>{stages.filter((stage) => stage.outcome === 'open').map((stage) => <option value={stage.key} key={stage.key}>{stage.label}</option>)}</select></label>
      </div>
      <div className="crm-form__row">
        <label>Valor estimado<input {...register('estimatedValue')} inputMode="decimal" autoComplete="off" /></label>
        <label>Moneda<input {...register('currency')} maxLength={3} autoComplete="off" spellCheck={false} /></label>
      </div>
      <FieldError id="opportunity-value-error" message={errors.estimatedValue?.message} />
      <label>Cierre esperado<input {...register('expectedCloseDate')} type="date" /></label>
      <button className="crm-button crm-button--primary" type="submit" disabled={pending}>{pending ? 'Creando…' : submitLabel}</button>
          </fieldset>
    </form>
  )
}

export function ActivityForm({ onSubmit, pending, submitLabel }: FormProps<ActivityFormValues>) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema), defaultValues: { activityType: 'note', summary: '', details: '' },
  })
  const submit = async (values: ActivityFormValues) => { await onSubmit(values); reset() }
  return (
    <form className="crm-form crm-form--compact" onSubmit={event => submitForm(event, handleSubmit, submit)} noValidate>
      <fieldset className="form-fields" disabled={pending || isSubmitting}>
      <label>Tipo<select {...register('activityType')}><option value="note">Nota</option><option value="call">Llamada</option><option value="meeting">Reunión</option><option value="email_reference">Referencia de correo</option></select></label>
      <label>Resumen<input {...register('summary')} autoComplete="off" aria-invalid={Boolean(errors.summary)} /></label>
      <FieldError id="activity-summary-error" message={errors.summary?.message} />
      <label>Detalle<textarea {...register('details')} rows={3} /></label>
      <button className="crm-button crm-button--primary" type="submit" disabled={pending}>{pending ? 'Registrando…' : submitLabel}</button>
          </fieldset>
    </form>
  )
}
