import { Link } from 'react-router-dom'
import type { PortalDeliverable, PortalProject } from '../api/portal-service'
import { formatPortalDate, statusLabel } from './portal-format'

export function PortalHeading({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return <div className="portal-heading"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{children}</div>
}

export function PortalState({ loading, error, empty, children }: { loading: boolean; error?: Error | null; empty?: boolean; children: React.ReactNode }) {
  if (loading) return <p className="portal-state" role="status">Cargando información…</p>
  if (error) return <p className="portal-state portal-state--error" role="alert">No pudimos cargar esta sección. {error.message}</p>
  if (empty) return <p className="portal-state">Todavía no hay contenido para mostrar aquí.</p>
  return <>{children}</>
}

export function PortalPager({ page, count, onPage }: { page: number; count: number; onPage: (page: number) => void }) {
  if (page === 0 && count < 20) return null
  return <nav className="portal-pager" aria-label="Páginas de resultados">
    <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>Anterior</button>
    <span>Página {page + 1}</span>
    <button type="button" disabled={count < 20} onClick={() => onPage(page + 1)}>Siguiente</button>
  </nav>
}

export function ProjectList({ projects }: { projects: PortalProject[] }) {
  return <div className="portal-list">{projects.map(project => <article className="portal-list__row" key={project.project_id}>
    <div><p className="portal-list__meta">{project.brand_name}</p><h3><Link to={`/portal/projects/${project.project_id}`}>{project.project_name}</Link></h3>
      <p className="portal-list__detail">{project.milestones_total ? `${project.milestones_done} de ${project.milestones_total} hitos completados` : 'Sin hitos publicados'}
        {project.next_milestone_date ? ` · Próximo hito: ${formatPortalDate(project.next_milestone_date)}` : ''}</p></div>
    <div className="portal-list__aside"><span className="portal-badge">{statusLabel(project.project_status)}</span>
      {project.pending_approvals > 0 ? <span>{project.pending_approvals} pendiente{project.pending_approvals === 1 ? '' : 's'}</span> : null}</div>
  </article>)}</div>
}

export function DeliverableList({ items }: { items: PortalDeliverable[] }) {
  return <div className="portal-list">{items.map(item => <article className="portal-list__row" key={item.publication_id}>
    <div><p className="portal-list__meta">{item.project_name} · Versión {item.version_number}</p>
      <h3><Link to={`/portal/deliverables/${item.publication_id}`}>{item.title}</Link></h3>
      <p className="portal-list__detail">Publicada el {formatPortalDate(item.published_at)}</p></div>
    <span className="portal-badge">{statusLabel(item.review_status)}</span>
  </article>)}</div>
}
