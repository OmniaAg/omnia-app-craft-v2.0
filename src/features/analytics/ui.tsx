import type { ReactNode } from 'react'
import { labels } from './model'

export function QueryState({ loading, error, children }: { loading: boolean; error: unknown; children: ReactNode }) {
  if (loading) return <p role="status">Cargando reporte…</p>
  if (error) return <p role="alert">No se pudo consultar este reporte. Comprueba tus filtros y permisos e intenta actualizar.</p>
  return <>{children}</>
}
export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  return <nav className="analytics-pager" aria-label="Paginación"><button disabled={page === 0} onClick={() => onPage(page - 1)}>Anterior</button>
    <span>{total ? `${page * 20 + 1}–${Math.min((page + 1) * 20, total)} de ${total}` : 'Sin registros'}</span>
    <button disabled={(page + 1) * 20 >= total} onClick={() => onPage(page + 1)}>Siguiente</button></nav>
}
export function Distribution({ title, values }: { title: string; values: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(values))
  return <section className="analytics-distribution"><h2>{title}</h2>{Object.keys(values).length
    ? <ul>{Object.entries(values).map(([name, count]) => <li key={name}><span>{labels[name] ?? name}</span>
      <span className="analytics-bar" aria-hidden="true"><span style={{ width: `${count / max * 100}%` }} /></span><strong>{count.toLocaleString('es-MX')}</strong></li>)}</ul>
    : <p>No hay datos para este periodo.</p>}</section>
}
export function Metrics({ values }: { values: [string, ReactNode][] }) {
  return <dl className="analytics-metrics">{values.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
}
export function Table({ caption, headers, children }: { caption: string; headers: string[]; children: ReactNode }) {
  return <div className="analytics-table-wrap" role="region" aria-label={caption} tabIndex={0}><table>
    <caption>{caption}</caption><thead><tr>{headers.map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}
