import { useFlushDrafts } from '../../drafts/draft-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { useAuth } from '../../auth/context/AuthContext'
import { createContact } from '../api/crm-service'
import { contactsQuery, crmKeys, organizationsQuery } from '../api/queries'
import type { ContactFormValues } from '../model/schemas'
import { ContactForm } from '../ui/CrmForms'
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
  const contacts = useQuery(contactsQuery({ page, search, status }))
  const organizations = useQuery(organizationsQuery({ page: 0, search: '', lifecycle: 'all' }))
  const eligibleOrganizations = organizations.data?.items.filter((item) => (auth.hasCapability('contact.create', item.id) || auth.hasCapability('contact.create', item.agency_id))) ?? []
  const selectedOrganization = organizationId || eligibleOrganizations[0]?.id || ''
  const mutation = useMutation({
    mutationFn: (values: ContactFormValues) => createContact(getSupabaseClient(), selectedOrganization, values),
    onSuccess: async () => { setSuccess('Contacto creado.'); setShowCreate(false); await queryClient.invalidateQueries({ queryKey: crmKeys.all }) },
  })
  const applySearch = (event: FormEvent) => { event.preventDefault(); setParams((current) => { current.set('page', '0'); const term = draftSearch.trim(); if (term) current.set('q', term); else current.delete('q'); return current }) }
  return (
    <section className="crm-page">
      <CrmPageHeader title="Contacts" description="Personas comerciales vinculadas a una Organization; no son cuentas de acceso." action={eligibleOrganizations.length ? <button className="crm-button crm-button--primary" type="button" disabled={mutation.isPending} onClick={() => void flushDrafts().then(saved=>{if(saved)setShowCreate(value=>!value)})}>{showCreate ? 'Cerrar formulario' : 'Nuevo contacto'}</button> : undefined} />
      {success ? <CrmSuccess message={success} /> : null}
      {showCreate ? <section className="crm-editor"><h2>Crear Contact</h2><label className="crm-standalone-field">Organization<select value={selectedOrganization} onChange={(event) => setOrganizationId(event.target.value)}>{eligibleOrganizations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><ContactForm submitLabel="Crear contacto" pending={mutation.isPending} onSubmit={(values) => mutation.mutateAsync(values).then(() => undefined)} />{mutation.error ? <CrmError message={mutation.error.message} /> : null}</section> : null}
      <form className="crm-filters" role="search" onSubmit={applySearch}><label>Buscar por nombre<input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} autoComplete="off" /></label><label>Status<select value={status} onChange={(event) => setParams((current) => { current.set('page', '0'); if (event.target.value === 'all') current.delete('status'); else current.set('status', event.target.value); return current })}><option value="all">Todos</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label><button className="crm-button" type="submit">Aplicar filtros</button></form>
      {contacts.error ? <CrmError message={contacts.error.message} /> : null}
      <div className="crm-table-wrap"><table className="crm-table"><caption className="sr-only">Listado paginado de contactos CRM</caption><thead><tr><th>Contacto</th><th>Organization</th><th>Correo</th><th>Puesto</th><th>Status</th></tr></thead><tbody>{contacts.isPending ? <LoadingRows /> : contacts.data?.items.map((contact) => <tr key={contact.id}><th>{contact.full_name}</th><td><Link to={`/app/crm/accounts/${contact.organization_id}`}>{contact.organizations?.name ?? 'Organization'}</Link></td><td>{contact.email ?? '—'}</td><td>{contact.job_title ?? '—'}</td><td><StatusBadge value={contact.status} /></td></tr>)}</tbody></table></div>
      {!contacts.isPending && contacts.data?.total === 0 ? <CrmEmpty title="No hay contactos con estos filtros" description="Cambia los filtros o crea un Contact dentro de una Organization autorizada." /> : null}
      {contacts.data ? <Pagination page={page} pageSize={contacts.data.pageSize} total={contacts.data.total} onPage={(nextPage) => setParams((current) => { current.set('page', String(nextPage)); return current })} /> : null}
    </section>
  )
}
