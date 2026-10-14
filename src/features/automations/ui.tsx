import type { ReactNode } from 'react'
import { CrmError, CrmPageHeader, Pagination } from '../crm/ui/CrmUi'
import type { usePhase13Project } from './usePhase13Project'
import { formatTime, safeMessage, statusLabel } from './model'
import '../crm/ui/crm.css'
import './automations.css'

export function ProjectSelect({ scope }: { scope: ReturnType<typeof usePhase13Project> }) {
  return <label className="p13-field">Proyecto<select value={scope.project} onChange={event => scope.select(event.target.value)} disabled={scope.options.isPending}>
    <option value="" disabled>Selecciona un proyecto autorizado</option>
    {scope.options.data?.map(option => <option key={option.id} value={option.id}>{option.organization_name} · {option.name}</option>)}
  </select></label>
}
export function Phase13Page({ title, description, error, children }: { title: string; description: string; error?: Error | null; children: ReactNode }) {
  return <section className="crm-page p13-page"><CrmPageHeader title={title} description={description} />{error ? <CrmError message={error.message} /> : null}{children}</section>
}
export function RunStatus({ status, error }: { status: string; error?: string | null }) {
  return <div><span className="p13-status" data-status={status}>{statusLabel(status)}</span>{error ? <p className="p13-error">{safeMessage(error)}</p> : null}</div>
}
export function HistoryPager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  return <Pagination page={page} total={total} pageSize={20} onPage={onPage} />
}
export function Timestamp({ value }: { value: string | null }) { return <time dateTime={value ?? undefined}>{formatTime(value)}</time> }
export function RunTiming({ started, finished }: { started: string | null; finished: string | null }) {
  const seconds = started && finished ? Math.max(0, (Date.parse(finished) - Date.parse(started)) / 1000) : null
  return <div className="p13-meta"><span>Inicio: <Timestamp value={started} /></span><span>Fin: <Timestamp value={finished} /></span>{seconds !== null ? <span>Duración: {new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(seconds)} s</span> : null}</div>
}
