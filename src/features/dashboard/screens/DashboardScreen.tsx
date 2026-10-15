import { lazy, Suspense, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/context/AuthContext'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { DashboardApiError, resetDashboardConfig, saveDashboardConfig, type DashboardConfigRow } from '../api/dashboard-service'
import { dashboardConfigQuery, dashboardKeys } from '../api/queries'
import { addWidget, availableWidgetKeys, defaultDashboard, normalizeDashboard, removeWidget, reorderDashboard, resizeDashboardAtBreakpoint, WIDGET_REGISTRY, type DashboardBreakpoint, type DashboardCapabilities, type DashboardDocument } from '../model/dashboard'
import '../ui/dashboard.css'
import { useUnsavedChanges } from '../../drafts/useUnsavedChanges'

const DashboardGrid = lazy(() => import('../ui/DashboardGrid'))
const OperationalOverview = lazy(() => import('../widgets/OperationalOverview'))

function rowFrom(document: DashboardDocument): DashboardConfigRow {
  return { user_id: '', dashboard_key: 'main', registry_version: document.registryVersion, widget_instances: document.instances, responsive_layouts: document.layouts, revision: document.revision, created_at: '', updated_at: '' } as unknown as DashboardConfigRow
}

export function Component() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const configQuery = useQuery(dashboardConfigQuery())
  const capabilities = useMemo<DashboardCapabilities>(() => ({
    canViewOpportunities: auth.hasCapability('opportunity.view'),
    canViewOrganizations: auth.hasCapability('organization.view'),
  }), [auth])
  const normalized = useMemo(() => normalizeDashboard(configQuery.data ? {
    registry_version: configQuery.data.registry_version,
    widget_instances: configQuery.data.widget_instances,
    responsive_layouts: configQuery.data.responsive_layouts,
    revision: configQuery.data.revision,
  } : null, capabilities), [capabilities, configQuery.data])
  const [draft, setDraft] = useState<DashboardDocument | null>(null)
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  const document = draft ?? normalized

  const saveMutation = useMutation({
    mutationFn: (next: DashboardDocument) => saveDashboardConfig(getSupabaseClient(), next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: dashboardKeys.config() })
      const previous = queryClient.getQueryData<DashboardConfigRow | null>(dashboardKeys.config())
      queryClient.setQueryData(dashboardKeys.config(), rowFrom(next))
      setDraft(next); setMessage('Guardando…'); setConflict(false)
      return { previous, attempted: next }
    },
    onSuccess: (row) => {
      queryClient.setQueryData(dashboardKeys.config(), row)
      setDraft(normalizeDashboard({ registry_version: row.registry_version, widget_instances: row.widget_instances, responsive_layouts: row.responsive_layouts, revision: row.revision }, capabilities))
      setMessage('Cambios guardados.')
    },
    onError: (error, _next, context) => {
      const isConflict = error instanceof DashboardApiError && (error.message.includes('otra sesión') || error.code === '40001')
      if (isConflict) {
        setDraft(context?.attempted ?? document); setConflict(true); setMessage('Hay una versión más reciente. Recarga antes de volver a guardar.');
        void queryClient.invalidateQueries({ queryKey: dashboardKeys.config() })
      } else {
        queryClient.setQueryData(dashboardKeys.config(), context?.previous ?? null)
        setDraft(context?.attempted ?? document)
        setMessage(error instanceof Error ? error.message : 'No pudimos guardar.')
      }
    },
  })

  const persist = (next: DashboardDocument) => { if (!saveMutation.isPending) saveMutation.mutate(next) }
  useUnsavedChanges('dashboard-layout', saveMutation.isPending || saveMutation.isError)
  const available = availableWidgetKeys(capabilities).filter((key) => !document.instances.some((instance) => instance.widgetKey === key))
  const move = (instanceId: string, direction: -1 | 1) => {
    persist(reorderDashboard(document, instanceId, direction))
  }
  const resize = (instanceId: string, breakpoint: DashboardBreakpoint, widthDelta: -1 | 0 | 1, heightDelta: -1 | 0 | 1) => {
    persist(resizeDashboardAtBreakpoint(document, instanceId, breakpoint, widthDelta, heightDelta))
  }
  const reloadConflict = async () => {
    const result = await configQuery.refetch()
    if(result.isError)return
    setDraft(normalizeDashboard(result.data ? { registry_version: result.data.registry_version, widget_instances: result.data.widget_instances, responsive_layouts: result.data.responsive_layouts, revision: result.data.revision } : null, capabilities))
    saveMutation.reset()
    setConflict(false); setEditing(false); setMessage('Versión del servidor cargada.')
  }
  const resetMutation = useMutation({
    mutationFn: () => resetDashboardConfig(getSupabaseClient(), document.revision),
    onSuccess: () => { queryClient.setQueryData(dashboardKeys.config(), null); setDraft(defaultDashboard(capabilities)); saveMutation.reset(); setEditing(false); setConflict(false); setMessage('Dashboard restablecido.') },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'No pudimos restablecer.'),
  })

  if (configQuery.isPending) return <div className="dashboard-loading" role="status">Cargando tu dashboard…</div>
  if (configQuery.isError) return <section className="dashboard-error" role="alert"><h1 data-route-heading tabIndex={-1}>Tu dashboard</h1><p>No pudimos cargar tu configuración.</p><button type="button" onClick={() => void configQuery.refetch()}>Reintentar</button></section>

  return <div className="dashboard-page">
    <header className="dashboard-header">
      <div><h1 data-route-heading tabIndex={-1}>Tu dashboard</h1><p>Prioridades, trabajo y proyectos dentro de tu alcance.</p></div>
      <div className="dashboard-header__actions"><button type="button" className="dashboard-button dashboard-button--primary" aria-pressed={editing} onClick={() => { setEditing((value) => !value); setMessage(null) }}>{editing ? 'Terminar edición' : 'Personalizar'}</button>{editing ? <button type="button" className="dashboard-button" disabled={resetMutation.isPending} onClick={() => resetMutation.mutate()}>Restablecer</button> : null}</div>
    </header>
    {normalized.source === 'recovered' ? <p className="dashboard-notice" role="status">Una configuración incompatible se recuperó con los valores predeterminados seguros.</p> : null}
    {auth.hasCapability('analytics.view') ? <Suspense fallback={<p role="status">Preparando prioridades…</p>}><OperationalOverview /></Suspense> : null}
    {saveMutation.isError && !conflict ? <button className="dashboard-button" type="button" onClick={()=>persist(document)}>Reintentar guardado</button> : null}
    {conflict ? <div className="dashboard-notice dashboard-notice--warning" role="alert"><span>{message}</span><button type="button" onClick={() => void reloadConflict()}>Cargar versión del servidor</button></div> : message ? <p className="dashboard-save-status" role="status">{message}</p> : null}
    {editing ? <aside className="dashboard-toolbox" aria-labelledby="dashboard-toolbox-title"><div><h2 id="dashboard-toolbox-title">Biblioteca de widgets</h2><p>Arrastra en escritorio o usa los controles de cada widget. En móvil el orden es vertical.</p></div><div className="dashboard-toolbox__items">{available.length ? available.map((key) => <button type="button" key={key} disabled={saveMutation.isPending} onClick={() => persist(addWidget(document, key))}>+ {WIDGET_REGISTRY[key].title}</button>) : <span>Todos los widgets disponibles están activos.</span>}</div></aside> : null}
    {document.instances.length ? <Suspense fallback={<p className="dashboard-loading">Preparando cuadrícula…</p>}><DashboardGrid document={document} editing={editing} busy={saveMutation.isPending} onLayoutCommit={(layouts) => persist({ ...document, layouts })} onRemove={(id) => persist(removeWidget(document, id))} onMove={move} onResize={resize} /></Suspense> : <section className="dashboard-empty"><h2>Tu espacio está vacío</h2><p>Activa la personalización para añadir un widget.</p></section>}
  </div>
}
