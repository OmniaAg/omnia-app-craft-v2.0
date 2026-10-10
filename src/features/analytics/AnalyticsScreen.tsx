import { useDeferredValue, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/context/AuthContext'
import { analyticsQueries, exportAnalytics } from './api'
import { analyticsCsv, filterSchema, period, readFilters, sections, type Filters, type Section } from './model'
import { Billing, Editorial, Overview, Projects, Reports, Reviews, Work } from './sections'
import './analytics.css'

const sectionNames: Record<Section, string> = { overview: 'Resumen', projects: 'Proyectos', work: 'Trabajo', editorial: 'Editorial', reviews: 'Entregas y revisiones', billing: 'Cobros operativos', reports: 'Reportes cliente' }
function ScopePicker({ actor, filters, kind, label, onPick }: {
  actor: string; filters: Filters; kind: 'organization' | 'brand' | 'project'; label: string; onPick: (value: string) => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const deferred = useDeferredValue(search)
  const q = useQuery(analyticsQueries.options(actor, filters, kind, deferred, page))
  return <div className="analytics-scope"><label>Buscar {label.toLowerCase()}<input name={`${kind}-search`} autoComplete="off" type="search" value={search} maxLength={100}
    onChange={e => { setSearch(e.target.value); setPage(0) }} /></label>
    <label>{label}<select name={kind} value={filters[kind] ?? ''} disabled={q.isPending || !!q.error} onChange={e => onPick(e.target.value)}>
      <option value="">Todo mi alcance</option>{filters[kind] && !q.data?.items.some(item => item.id === filters[kind])
        ? <option value={filters[kind]}>Selección actual</option> : null}
      {q.data?.items.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select></label>{q.error ? <span role="alert">No se pudieron cargar opciones.</span> : null}
    {(q.data?.total ?? 0) > 20 ? <div className="analytics-actions"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Opciones anteriores</button>
      <button disabled={(page + 1) * 20 >= (q.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Más opciones</button></div> : null}
  </div>
}
function DateFilters({ filters, onApply }: { filters: Filters; onApply: (from: string, to: string) => void }) {
  const [from, setFrom] = useState(filters.from)
  const [to, setTo] = useState(filters.to)
  const [preset, setPreset] = useState(() => String([7, 30, 90].find(days => {
    const range = period(days); return range.from === filters.from && range.to === filters.to
  }) ?? 'custom'))
  const [error, setError] = useState('')
  return <form className="analytics-filters" onSubmit={e => { e.preventDefault(); const parsed = filterSchema.safeParse({ ...filters, from, to });
    if (parsed.success) { setError(''); onApply(from, to) } else setError('Elige fechas en orden y un máximo de 366 días.') }}>
    <label>Periodo<select name="period" value={preset} onChange={e => { setPreset(e.target.value); if (e.target.value !== 'custom') { const range = period(Number(e.target.value)); setFrom(range.from); setTo(range.to); onApply(range.from, range.to) } }}>
      <option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="custom">Personalizado</option>
    </select></label><label>Desde<input name="from" autoComplete="off" type="date" required value={from} onChange={e => { setFrom(e.target.value); setPreset('custom') }} /></label>
    <label>Hasta<input name="to" autoComplete="off" type="date" required value={to} onChange={e => { setTo(e.target.value); setPreset('custom') }} /></label><button>Aplicar fechas</button>
    {error ? <p role="alert">{error}</p> : null}</form>
}
export function Component() {
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const parsed = readFilters(params)
  const filters = parsed.success ? parsed.data : null
  const requested = params.get('section')
  const section: Section = sections.includes(requested as Section) ? requested as Section : 'overview'
  const actor = auth.actor?.user.id ?? ''
  const cache = useQueryClient()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [refreshed, setRefreshed] = useState('')
  const billingAllowed = auth.hasCapability('analytics.view_billing') && auth.hasCapability('billing.view')
  function update(values: Record<string, string | undefined>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key) }
    setParams(next)
  }
  async function exportCsv() {
    if (!filters) return
    setExporting(true); setExportError('')
    try {
      const data = await exportAnalytics(section, filters)
      const url = URL.createObjectURL(new Blob([analyticsCsv(data, filters, section)], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `omnia-${section}-${filters.from}-${filters.to}.csv`
      anchor.click(); URL.revokeObjectURL(url)
    } catch { setExportError('No se pudo exportar. Comprueba tus permisos e intenta de nuevo.') }
    finally { setExporting(false) }
  }
  if (!auth.hasCapability('analytics.view')) return <div className="analytics-page"><h1 data-route-heading tabIndex={-1}>Analytics</h1><p>No tienes acceso a esta sección.</p></div>
  return <div className="analytics-page"><header className="analytics-heading"><div><h1 data-route-heading tabIndex={-1}>Analytics y reportes</h1>
    <p>Estado operativo y actividad del alcance al que tienes acceso.</p></div><div className="analytics-actions">
      <button onClick={async () => { await cache.invalidateQueries({ queryKey: ['analytics', actor] }); setRefreshed(new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City' })) }}>Actualizar</button>
      {auth.hasCapability('analytics.export') && !['projects', 'reports'].includes(section) && (section !== 'billing' || billingAllowed)
        ? <button disabled={exporting || !filters} onClick={() => void exportCsv()}>{exporting ? 'Exportando…' : 'Exportar resumen CSV'}</button> : null}
    </div></header>{refreshed ? <p role="status">Actualizado a las {refreshed}.</p> : null}{exportError ? <p role="alert">{exportError}</p> : null}
    {!filters ? <><p role="alert">Los filtros de la URL son inválidos. Usa fechas válidas y un rango máximo de 366 días.</p><button onClick={() => setParams({ section })}>Restablecer filtros</button></> : <>
      <DateFilters key={`${filters.from}-${filters.to}`} filters={filters} onApply={(from, to) => update({ from, to })} />
      <div className="analytics-filters">
        <ScopePicker actor={actor} filters={filters} kind="organization" label="Organization" onPick={organization => update({ organization, brand: undefined, project: undefined })} />
        <ScopePicker key={filters.organization ?? 'all'} actor={actor} filters={filters} kind="brand" label="Marca" onPick={brand => update({ brand, project: undefined })} />
        <ScopePicker key={`${filters.organization}-${filters.brand}`} actor={actor} filters={filters} kind="project" label="Proyecto" onPick={project => update({ project })} />
        {section === 'billing' && billingAllowed ? <label>Moneda<select value={filters.currency ?? ''} onChange={e => update({ currency: e.target.value })}><option value="">Todas, separadas</option><option value="MXN">MXN</option><option value="USD">USD</option></select></label> : null}
      </div><nav className="analytics-tabs" aria-label="Secciones de analytics">{sections.filter(s => s !== 'billing' || billingAllowed).map(s =>
        <button key={s} aria-current={section === s ? 'page' : undefined} onClick={() => update({ section: s, detail: undefined })}>{sectionNames[s]}</button>)}</nav>
      <p>Los estados y pendientes son actuales. La actividad usa el periodo seleccionado en America/Mexico_City. Analytics es descriptivo.</p>
      <div className="analytics-page" key={JSON.stringify(filters) + section}>
        {section === 'overview' ? <Overview actor={actor} filters={filters} onDetails={detail => update({ section: 'work', detail })} /> : null}
        {section === 'projects' ? <Projects actor={actor} filters={filters} /> : null}
        {section === 'work' ? <Work actor={actor} filters={filters} initialFilter={['open', 'overdue', 'blocked', 'completed'].includes(params.get('detail') ?? '') ? params.get('detail')! : 'overdue'} /> : null}
        {section === 'editorial' ? <Editorial actor={actor} filters={filters} /> : null}
        {section === 'reviews' ? <Reviews actor={actor} filters={filters} /> : null}
        {section === 'billing' ? billingAllowed ? <Billing actor={actor} filters={filters} /> : <p role="alert">No tienes acceso a analytics de cobros.</p> : null}
        {section === 'reports' ? <Reports actor={actor} filters={filters} /> : null}
      </div><details><summary>Definiciones de las métricas</summary><p>Trabajo abierto excluye terminado, cancelado y archivado. Vencido significa fecha límite anterior al instante actual.
        Proyectos e hitos usan su estado actual, sin porcentaje de avance inventado. Editorial usa fecha programada.
        Revisiones cuentan rondas, sin multiplicarlas por reviewers; duración = apertura hasta cierre. Billing usa fecha del documento, pagos no anulados y monedas separadas.</p></details>
    </>}</div>
}
