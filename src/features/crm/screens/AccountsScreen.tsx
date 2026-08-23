import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { useAuth } from '../../auth/context/AuthContext'
import { createOrganization } from '../api/crm-service'
import { crmKeys, organizationsQuery } from '../api/queries'
import type { OrganizationFormValues } from '../model/schemas'
import { OrganizationForm } from '../ui/CrmForms'
import { CrmEmpty, CrmError, CrmPageHeader, CrmSuccess, LoadingRows, Pagination, StatusBadge } from '../ui/CrmUi'
import '../ui/crm.css'

export function Component() {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  const search = params.get('q') ?? ''
  const lifecycle = params.get('lifecycle') ?? 'all'
  const [draftSearch, setDraftSearch] = useState(search)
  const [showCreate, setShowCreate] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const filters = { page, search, lifecycle }
  const organizations = useQuery(organizationsQuery(filters))
  const canCreate = auth.hasCapability('organization.create')
  const createMutation = useMutation({
    mutationFn: (values: OrganizationFormValues) => createOrganization(getSupabaseClient(), values),
    onSuccess: async (id) => {
      setSuccess('Organización creada. Ya puedes añadir su primera marca.')
      setShowCreate(false)
      await queryClient.invalidateQueries({ queryKey: crmKeys.all })
      navigate(`/app/crm/accounts/${id}`)
    },
  })

  const applySearch = (event: FormEvent) => {
    event.preventDefault()
    setParams((current) => {
      current.set('page', '0')
      const term = draftSearch.trim()
      if (term) current.set('q', term); else current.delete('q')
      return current
    })
  }

  return (
    <section className="crm-page">
      <CrmPageHeader
        title="Organizations"
        description="Prospectos y clientes activos comparten un único registro comercial."
        action={canCreate ? <button className="crm-button crm-button--primary" type="button" onClick={() => setShowCreate((value) => !value)} aria-expanded={showCreate}>{showCreate ? 'Cerrar formulario' : 'Nueva organización'}</button> : undefined}
      />
      {success ? <CrmSuccess message={success} /> : null}
      {showCreate ? (
        <section className="crm-editor" aria-labelledby="new-organization-title">
          <h2 id="new-organization-title">Crear organización</h2>
          <OrganizationForm submitLabel="Crear organización" pending={createMutation.isPending} onSubmit={async (values) => { setSuccess(null); await createMutation.mutateAsync(values) }} />
          {createMutation.error ? <CrmError message={createMutation.error.message} /> : null}
        </section>
      ) : null}
      <form className="crm-filters" role="search" onSubmit={applySearch}>
        <label>Buscar por nombre<input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} autoComplete="off" /></label>
        <label>Lifecycle<select value={lifecycle} onChange={(event) => setParams((current) => { current.set('page', '0'); if (event.target.value === 'all') current.delete('lifecycle'); else current.set('lifecycle', event.target.value); return current })}><option value="all">Todos</option><option value="prospect">Prospect</option><option value="active_client">Active client</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>
        <button className="crm-button" type="submit">Aplicar filtros</button>
      </form>
      {organizations.error ? <CrmError message={organizations.error.message} /> : null}
      <div className="crm-table-wrap">
        <table className="crm-table">
          <caption className="sr-only">Listado paginado de organizaciones</caption>
          <thead><tr><th scope="col">Organización</th><th scope="col">Dominio</th><th scope="col">Lifecycle</th><th scope="col">Timezone</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            {organizations.isPending ? <LoadingRows /> : null}
            {organizations.data?.items.map((organization) => (
              <tr key={organization.id}>
                <th scope="row"><Link to={`/app/crm/accounts/${organization.id}`}>{organization.name}</Link></th>
                <td>{organization.domain ?? '—'}</td><td><StatusBadge value={organization.lifecycle} /></td><td>{organization.timezone}</td>
                <td><Link className="crm-row-link" to={`/app/crm/accounts/${organization.id}`}>Abrir</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!organizations.isPending && organizations.data?.total === 0 ? <CrmEmpty title="No hay organizaciones con estos filtros" description={canCreate ? 'Crea el primer registro comercial o cambia los filtros.' : 'Cambia los filtros o solicita el scope correspondiente.'} /> : null}
      {organizations.data ? <Pagination page={page} pageSize={organizations.data.pageSize} total={organizations.data.total} onPage={(nextPage) => setParams((current) => { current.set('page', String(nextPage)); return current })} /> : null}
    </section>
  )
}
