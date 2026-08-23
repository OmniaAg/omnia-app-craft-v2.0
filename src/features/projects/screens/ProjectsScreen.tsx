import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { useAuth } from '../../auth/context/AuthContext'
import { CrmEmpty, CrmError, CrmPageHeader, LoadingRows, Pagination, StatusBadge } from '../../crm/ui/CrmUi'
import { createProject } from '../api/project-service'
import { projectBrandsQuery, projectKeys, projectsQuery } from '../api/queries'
import type { ProjectFormValues } from '../model/schemas'
import { ProjectForm } from '../ui/ProjectForms'
import '../../crm/ui/crm.css'
import '../ui/projects.css'

const dateOnly = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' })

export function Component() {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  const search = params.get('q') ?? ''
  const status = params.get('status') ?? 'all'
  const [draftSearchState, setDraftSearchState] = useState({ source: search, value: search })
  const draftSearch = draftSearchState.source === search ? draftSearchState.value : search
  const [showCreate, setShowCreate] = useState(false)
  const filters = { page, search, status }
  const projects = useQuery(projectsQuery(filters))
  const canCreate = auth.hasCapability('project.create')
  const brands = useQuery({ ...projectBrandsQuery(), enabled: canCreate })
  const createMutation = useMutation({
    mutationFn: (values: ProjectFormValues) => createProject(getSupabaseClient(), values),
    onSuccess: async (projectId) => {
      await queryClient.invalidateQueries({ queryKey: projectKeys.all })
      navigate(`/app/projects/${projectId}`)
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
    <section className="crm-page project-page">
      <CrmPageHeader
        title="Proyectos"
        description="Portafolio operativo por marca, con membresía explícita y trabajo trazable."
        action={canCreate ? <button className="crm-button crm-button--primary" type="button" onClick={() => setShowCreate((value) => !value)} aria-expanded={showCreate}>{showCreate ? 'Cerrar formulario' : 'Nuevo proyecto'}</button> : undefined}
      />
      {showCreate ? (
        <section className="crm-editor" aria-labelledby="new-project-title">
          <h2 id="new-project-title">Crear proyecto</h2>
          {brands.error ? <CrmError message={brands.error.message} /> : null}
          {brands.isPending ? <p role="status">Cargando marcas disponibles…</p> : null}
          {brands.data ? <ProjectForm brands={brands.data} pending={createMutation.isPending} onSubmit={(values) => createMutation.mutateAsync(values).then(() => undefined)} /> : null}
          {createMutation.error ? <CrmError message={createMutation.error.message} /> : null}
          {brands.data?.length === 0 ? <CrmEmpty title="No hay marcas disponibles" description="El proyecto requiere una marca activa de un cliente activo dentro de tu scope." /> : null}
        </section>
      ) : null}
      <form className="crm-filters" role="search" onSubmit={applySearch}>
        <label>Buscar proyecto, marca u organización<input value={draftSearch} onChange={(event) => setDraftSearchState({ source: search, value: event.target.value })} autoComplete="off" /></label>
        <label>Estado<select value={status} onChange={(event) => setParams((current) => { current.set('page', '0'); if (event.target.value === 'all') current.delete('status'); else current.set('status', event.target.value); return current })}><option value="all">No archivados</option><option value="planning">Planeación</option><option value="active">Activo</option><option value="on_hold">En pausa</option><option value="completed">Completado</option><option value="archived">Archivado</option></select></label>
        <button className="crm-button" type="submit">Aplicar filtros</button>
      </form>
      {projects.error ? <CrmError message={projects.error.message} /> : null}
      <div className="crm-table-wrap">
        <table className="crm-table">
          <caption className="sr-only">Listado paginado de proyectos autorizados</caption>
          <thead><tr><th scope="col">Proyecto</th><th scope="col">Cliente / Marca</th><th scope="col">Estado</th><th scope="col">Lead</th><th scope="col">Fecha objetivo</th><th scope="col"><span className="sr-only">Acción</span></th></tr></thead>
          <tbody>
            {projects.isPending ? <LoadingRows columns={6} /> : null}
            {projects.data?.items.map((project) => (
              <tr key={project.project_id}>
                <th scope="row"><Link to={`/app/projects/${project.project_id}`}>{project.project_name}</Link>{project.project_description ? <span className="crm-cell-detail">{project.project_description}</span> : null}</th>
                <td>{project.organization_name}<span className="crm-cell-detail">{project.brand_name}</span></td>
                <td><StatusBadge value={project.project_status} /></td>
                <td>{project.lead_name || 'Sin lead'}</td>
                <td>{project.target_end_date ? dateOnly.format(new Date(`${project.target_end_date}T00:00:00Z`)) : 'Sin fecha'}</td>
                <td><Link className="crm-row-link" to={`/app/projects/${project.project_id}`}>Abrir</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!projects.isPending && projects.data?.total === 0 ? <CrmEmpty title="No hay proyectos con estos filtros" description={canCreate ? 'Crea un proyecto o ajusta la búsqueda.' : 'Tu lista solo incluye proyectos con membership o alcance autorizado.'} /> : null}
      {projects.data ? <Pagination page={page} pageSize={projects.data.pageSize} total={projects.data.total} onPage={(nextPage) => setParams((current) => { current.set('page', String(nextPage)); return current })} /> : null}
    </section>
  )
}
