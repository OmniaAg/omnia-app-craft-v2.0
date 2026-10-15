import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { useAuth } from '../../auth/context/AuthContext'
import {
  createActivity,
  createBrand,
  createContact,
  createOpportunity,
  promoteOrganization,
  updateOrganization,
} from '../api/crm-service'
import { activitiesQuery, brandsQuery, contactsQuery, crmKeys, organizationQuery, opportunitiesQuery, pipelineStagesQuery } from '../api/queries'
import type { ActivityFormValues, BrandFormValues, ContactFormValues, OpportunityFormValues, OrganizationFormValues } from '../model/schemas'
import { ActivityForm, BrandForm, ContactForm, OpportunityForm, OrganizationForm } from '../ui/CrmForms'
import { CrmEmpty, CrmError, CrmPageHeader, CrmSuccess, LoadingRows, StatusBadge } from '../ui/CrmUi'
import '../ui/crm.css'

type DetailTab = 'overview' | 'brands' | 'contacts' | 'opportunities' | 'activity'

export function Component() {
  const { organizationId = '' } = useParams()
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const requestedTab = params.get('tab')
  const tab: DetailTab = requestedTab && ['overview', 'brands', 'contacts', 'opportunities', 'activity'].includes(requestedTab) ? requestedTab as DetailTab : 'overview'
  const [feedback, setFeedback] = useState<string | null>(null)
  const organization = useQuery(organizationQuery(organizationId))
  const brands = useQuery({ ...brandsQuery(organizationId), enabled: tab === 'brands' || tab === 'opportunities' })
  const contacts = useQuery({ ...contactsQuery({ page: 0, search: '', status: 'all', organizationId }), enabled: tab === 'contacts' })
  const opportunities = useQuery({ ...opportunitiesQuery({ page: 0, search: '', status: 'all', organizationId }), enabled: tab === 'opportunities' })
  const activities = useQuery({ ...activitiesQuery(organizationId), enabled: tab === 'activity' })
  const stages = useQuery({ ...pipelineStagesQuery(), enabled: tab === 'opportunities' })
  const invalidate = async () => queryClient.invalidateQueries({ queryKey: crmKeys.all })

  const updateMutation = useMutation({ mutationFn: (values: OrganizationFormValues) => updateOrganization(getSupabaseClient(), organizationId, values), onSuccess: async () => { setFeedback('Organization actualizada.'); await queryClient.invalidateQueries({ queryKey: crmKeys.all }) } })
  const promoteMutation = useMutation({ mutationFn: () => promoteOrganization(getSupabaseClient(), organizationId), onSuccess: async () => { setFeedback('Organization promovida a cliente activo.'); await queryClient.invalidateQueries({ queryKey: crmKeys.all }) } })
  const brandMutation = useMutation({ mutationFn: (values: BrandFormValues) => createBrand(getSupabaseClient(), organizationId, values), onSuccess: async () => { setFeedback('Marca creada.'); await invalidate() } })
  const contactMutation = useMutation({ mutationFn: (values: ContactFormValues) => createContact(getSupabaseClient(), organizationId, values), onSuccess: async () => { setFeedback('Contacto creado.'); await invalidate() } })
  const opportunityMutation = useMutation({ mutationFn: (values: OpportunityFormValues) => createOpportunity(getSupabaseClient(), organizationId, auth.actor?.user.id ?? '', values), onSuccess: async () => { setFeedback('Oportunidad creada.'); await invalidate() } })
  const activityMutation = useMutation({ mutationFn: (values: ActivityFormValues) => createActivity(getSupabaseClient(), organizationId, values), onSuccess: async () => { setFeedback('Actividad registrada.'); await invalidate() } })
  const activeError = updateMutation.error ?? promoteMutation.error ?? brandMutation.error ?? contactMutation.error ?? opportunityMutation.error ?? activityMutation.error

  if (organization.isPending) return <section className="crm-page"><p role="status">Cargando organización…</p></section>
  if (organization.error) return <section className="crm-page"><CrmError message={organization.error.message} /></section>
  const account = organization.data
  if (!account) return null
  const can = (key: string) => auth.hasCapability(key, organizationId) || auth.hasCapability(key, account.agency_id)

  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: 'overview', label: 'Overview' }, { key: 'brands', label: 'Brands' },
    { key: 'contacts', label: 'Contacts' }, { key: 'opportunities', label: 'Opportunities' },
    { key: 'activity', label: 'Activity' },
  ]
  return (
    <section className="crm-page">
      <Link className="crm-back-link" to="/app/crm/accounts">← Organizations</Link>
      <CrmPageHeader title={account.name} description={`${account.domain ?? 'Sin dominio'} · ${account.timezone}`} action={<StatusBadge value={account.lifecycle} />} />
      <div className="crm-tabs" role="tablist" aria-label="Detalle de organización">{tabs.map((item) => <button type="button" role="tab" aria-selected={tab === item.key} key={item.key} onClick={() => { setParams((current) => { if (item.key === 'overview') current.delete('tab'); else current.set('tab', item.key); return current }); setFeedback(null) }}>{item.label}</button>)}</div>
      {feedback ? <CrmSuccess message={feedback} /> : null}{activeError ? <CrmError message={activeError.message} /> : null}

      {tab === 'overview' ? <section className="crm-detail-grid"><div className="crm-section"><h2>Datos comerciales</h2>{can('organization.manage') ? <OrganizationForm organization={account} submitLabel="Guardar cambios" pending={updateMutation.isPending} onSubmit={(values) => updateMutation.mutateAsync(values).then(() => undefined)} /> : <p>Tu scope permite lectura, no edición.</p>}</div><aside className="crm-section"><h2>Promoción</h2><p>El comando exige lifecycle prospect y al menos una Brand activa.</p>{account.lifecycle === 'prospect' && can('organization.promote') ? <button className="crm-button crm-button--primary" type="button" disabled={promoteMutation.isPending} onClick={() => promoteMutation.mutate()}>{promoteMutation.isPending ? 'Promoviendo…' : 'Promover a cliente'}</button> : null}</aside></section> : null}

      {tab === 'brands' ? <section className="crm-detail-grid"><div className="crm-section"><h2>Brands</h2>{brands.isPending ? <p role="status">Cargando marcas…</p> : brands.data?.length ? <ul className="crm-record-list">{brands.data.map((brand) => <li key={brand.id}><strong>{brand.name}</strong><StatusBadge value={brand.status} /><span>{brand.timezone ?? 'Hereda timezone'}</span></li>)}</ul> : <CrmEmpty title="No hay marcas" description="Añade una marca activa antes de promover esta Organization." />}</div>{can('brand.create') ? <aside className="crm-section"><h2>Nueva Brand</h2><BrandForm submitLabel="Crear marca" pending={brandMutation.isPending} onSubmit={(values) => brandMutation.mutateAsync(values).then(() => undefined)} /></aside> : null}</section> : null}

      {tab === 'contacts' ? <section className="crm-detail-grid"><div className="crm-section"><h2>Contacts</h2><div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Puesto</th><th>Status</th></tr></thead><tbody>{contacts.isPending ? <LoadingRows columns={4} /> : contacts.data?.items.map((contact) => <tr key={contact.id}><th>{contact.full_name}</th><td>{contact.email ?? '—'}</td><td>{contact.job_title ?? '—'}</td><td><StatusBadge value={contact.status} /></td></tr>)}</tbody></table></div>{contacts.data?.total === 0 ? <CrmEmpty title="No hay contactos" description="Los contactos CRM existen aunque nunca tengan una cuenta de Portal." /> : null}</div>{can('contact.create') ? <aside className="crm-section"><h2>Nuevo Contact</h2><ContactForm submitLabel="Crear contacto" pending={contactMutation.isPending} onSubmit={(values) => contactMutation.mutateAsync(values).then(() => undefined)} /></aside> : null}</section> : null}

      {tab === 'opportunities' ? <section className="crm-detail-grid"><div className="crm-section"><h2>Opportunities</h2><div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Oportunidad</th><th>Etapa</th><th>Valor</th><th>Status</th></tr></thead><tbody>{opportunities.isPending ? <LoadingRows columns={4} /> : opportunities.data?.items.map((opportunity) => <tr key={opportunity.id}><th>{opportunity.name}</th><td>{opportunity.pipeline_stages?.label ?? opportunity.stage_key}</td><td>{opportunity.estimated_value == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: opportunity.currency }).format(opportunity.estimated_value)}</td><td><StatusBadge value={opportunity.status} /></td></tr>)}</tbody></table></div>{opportunities.data?.total === 0 ? <CrmEmpty title="No hay oportunidades" description="Registra una oportunidad para comenzar el pipeline comercial." /> : null}</div>{can('opportunity.create') ? <aside className="crm-section"><h2>Nueva Opportunity</h2><OpportunityForm brands={brands.data ?? []} stages={stages.data ?? []} submitLabel="Crear oportunidad" pending={opportunityMutation.isPending} onSubmit={(values) => opportunityMutation.mutateAsync(values).then(() => undefined)} /></aside> : null}</section> : null}

      {tab === 'activity' ? <section className="crm-detail-grid"><div className="crm-section"><h2>Activity</h2>{activities.isPending ? <p role="status">Cargando actividad…</p> : activities.data?.length ? <ol className="crm-timeline">{activities.data.map((activity) => <li key={activity.id}><div><strong>{activity.summary}</strong><StatusBadge value={activity.activity_type} /></div><p>{activity.details ?? (activity.is_system_generated ? 'Registro generado por el sistema.' : 'Sin detalle adicional.')}</p><time dateTime={activity.occurred_at}>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activity.occurred_at))}</time></li>)}</ol> : <CrmEmpty title="No hay actividad" description="Registra una nota, llamada o reunión para conservar el contexto comercial." />}</div>{can('crm_activity.create') ? <aside className="crm-section"><h2>Nueva actividad</h2><ActivityForm submitLabel="Registrar actividad" pending={activityMutation.isPending} onSubmit={(values) => activityMutation.mutateAsync(values).then(() => undefined)} /></aside> : null}</section> : null}
    </section>
  )
}
