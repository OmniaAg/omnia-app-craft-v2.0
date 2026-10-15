import { useFlushDrafts } from '../../drafts/draft-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { useAuth } from '../../auth/context/AuthContext'
import { changeOpportunityStage, createOpportunity } from '../api/crm-service'
import { brandsQuery, crmKeys, opportunitiesQuery, organizationsQuery, pipelineStagesQuery } from '../api/queries'
import type { OpportunityFormValues } from '../model/schemas'
import { OpportunityForm } from '../ui/CrmForms'
import { CrmEmpty, CrmError, CrmPageHeader, CrmSuccess, LoadingRows, Pagination, StatusBadge } from '../ui/CrmUi'
import '../ui/crm.css'

export function Component() {
  const auth = useAuth()
  const flushDrafts=useFlushDrafts()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  const search = params.get('q') ?? ''
  const status = params.get('status') ?? 'all'
  const [draftSearch, setDraftSearch] = useState(search)
  const [organizationId, setOrganizationId] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const opportunities = useQuery(opportunitiesQuery({ page, search, status }))
  const organizations = useQuery(organizationsQuery({ page: 0, search: '', lifecycle: 'all' }))
  const stages = useQuery(pipelineStagesQuery())
  const eligibleOrganizations = organizations.data?.items.filter((item) => (auth.hasCapability('opportunity.create', item.id) || auth.hasCapability('opportunity.create', item.agency_id))) ?? []
  const selectedOrganization = organizationId || eligibleOrganizations[0]?.id || ''
  const brands = useQuery({ ...brandsQuery(selectedOrganization), enabled: Boolean(selectedOrganization) })
  const createMutation = useMutation({
    mutationFn: (values: OpportunityFormValues) => createOpportunity(getSupabaseClient(), selectedOrganization, auth.actor?.user.id ?? '', values),
    onSuccess: async () => { setSuccess('Oportunidad creada.'); setShowCreate(false); await queryClient.invalidateQueries({ queryKey: crmKeys.all }) },
  })
  const stageMutation = useMutation({
    mutationFn: ({ id, stageKey }: { id: string; stageKey: string }) => changeOpportunityStage(getSupabaseClient(), id, stageKey),
    onSuccess: async () => { setSuccess('Etapa actualizada y registrada en Activity.'); await queryClient.invalidateQueries({ queryKey: crmKeys.all }) },
  })
  const applySearch = (event: FormEvent) => { event.preventDefault(); setParams((current) => { current.set('page', '0'); const term = draftSearch.trim(); if (term) current.set('q', term); else current.delete('q'); return current }) }
  return (
    <section className="crm-page">
      <CrmPageHeader title="Opportunities" description="Pipeline comercial mínimo con etapas server-managed y ownership explícito." action={eligibleOrganizations.length ? <button className="crm-button crm-button--primary" type="button" disabled={createMutation.isPending} onClick={() => void flushDrafts().then(saved=>{if(saved)setShowCreate(value=>!value)})}>{showCreate ? 'Cerrar formulario' : 'Nueva oportunidad'}</button> : undefined} />
      {success ? <CrmSuccess message={success} /> : null}
      {showCreate ? <section className="crm-editor"><h2>Crear Opportunity</h2><label className="crm-standalone-field">Organization<select value={selectedOrganization} onChange={(event) => setOrganizationId(event.target.value)}>{eligibleOrganizations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><OpportunityForm brands={brands.data ?? []} stages={stages.data ?? []} submitLabel="Crear oportunidad" pending={createMutation.isPending} onSubmit={(values) => createMutation.mutateAsync(values).then(() => undefined)} />{createMutation.error ? <CrmError message={createMutation.error.message} /> : null}</section> : null}
      <form className="crm-filters" role="search" onSubmit={applySearch}><label>Buscar por nombre<input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} autoComplete="off" /></label><label>Status<select value={status} onChange={(event) => setParams((current) => { current.set('page', '0'); if (event.target.value === 'all') current.delete('status'); else current.set('status', event.target.value); return current })}><option value="all">Todos</option><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option><option value="archived">Archived</option></select></label><button className="crm-button" type="submit">Aplicar filtros</button></form>
      {opportunities.error ? <CrmError message={opportunities.error.message} /> : null}{stageMutation.error ? <CrmError message={stageMutation.error.message} /> : null}
      <div className="crm-table-wrap"><table className="crm-table"><caption className="sr-only">Listado paginado de oportunidades</caption><thead><tr><th>Oportunidad</th><th>Organization / Brand</th><th>Etapa</th><th>Valor</th><th>Status</th></tr></thead><tbody>{opportunities.isPending ? <LoadingRows /> : opportunities.data?.items.map((opportunity) => <tr key={opportunity.id}><th>{opportunity.name}</th><td><Link to={`/app/crm/accounts/${opportunity.organization_id}`}>{opportunity.organizations?.name ?? 'Organization'}</Link><span className="crm-cell-detail">{opportunity.brands?.name ?? 'Sin Brand específica'}</span></td><td>{(auth.hasCapability('opportunity.manage', opportunity.organization_id) || Boolean(opportunity.organizations && auth.hasCapability('opportunity.manage', opportunity.organizations.agency_id))) && opportunity.status !== 'archived' ? <label className="sr-only" htmlFor={`stage-${opportunity.id}`}>Etapa de {opportunity.name}</label> : null}{(auth.hasCapability('opportunity.manage', opportunity.organization_id) || Boolean(opportunity.organizations && auth.hasCapability('opportunity.manage', opportunity.organizations.agency_id))) && opportunity.status !== 'archived' ? <select id={`stage-${opportunity.id}`} value={opportunity.stage_key} disabled={stageMutation.isPending} onChange={(event) => stageMutation.mutate({ id: opportunity.id, stageKey: event.target.value })}>{stages.data?.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select> : opportunity.pipeline_stages?.label ?? opportunity.stage_key}</td><td>{opportunity.estimated_value == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: opportunity.currency }).format(opportunity.estimated_value)}</td><td><StatusBadge value={opportunity.status} /></td></tr>)}</tbody></table></div>
      {!opportunities.isPending && opportunities.data?.total === 0 ? <CrmEmpty title="No hay oportunidades con estos filtros" description="Cambia los filtros o crea una Opportunity dentro de una Organization autorizada." /> : null}
      {opportunities.data ? <Pagination page={page} pageSize={opportunities.data.pageSize} total={opportunities.data.total} onPage={(nextPage) => setParams((current) => { current.set('page', String(nextPage)); return current })} /> : null}
    </section>
  )
}
