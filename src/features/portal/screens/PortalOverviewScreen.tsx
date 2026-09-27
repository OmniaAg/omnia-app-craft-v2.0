import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { portalQueries } from '../api/queries'
import { DeliverableList, PortalHeading, PortalState, ProjectList } from '../ui/PortalPrimitives'

export function Component() {
  const projects = useQuery(portalQueries.projects(0))
  const deliverables = useQuery(portalQueries.deliverables(undefined, 0))
  const approvals = useQuery(portalQueries.approvals(0))
  const notifications = useQuery(portalQueries.notifications(0))
  return <div className="portal-page">
    <PortalHeading title="Tu espacio con OMNIA" description="Proyectos, entregas y decisiones reunidos en un solo lugar." />
    <div className="portal-overview-grid">
      <section className="portal-section portal-section--priority" aria-labelledby="portal-pending-title">
        <div className="portal-section__heading"><h2 id="portal-pending-title">Necesita tu atención</h2><Link to="/portal/approvals">Ver aprobaciones</Link></div>
        <PortalState loading={approvals.isLoading} error={approvals.error}>
          {approvals.data?.length ? <div className="portal-quick-list">{approvals.data.slice(0, 3).map(item =>
            <Link key={item.assignment_id} to={`/portal/deliverables/${item.publication_id}`}>
              <strong>{item.title}</strong><span>{item.project_name} · Versión {item.version_number}</span>
            </Link>)}</div> : <p className="portal-empty">No tienes aprobaciones pendientes.</p>}
        </PortalState>
      </section>
      <section className="portal-section" aria-labelledby="portal-notifications-title">
        <div className="portal-section__heading"><h2 id="portal-notifications-title">Novedades</h2></div>
        <PortalState loading={notifications.isLoading} error={notifications.error}>
          {notifications.data?.length ? <ul className="portal-notifications">{notifications.data.slice(0, 5).map(item =>
            <li key={item.id}><span className={item.read_at ? '' : 'portal-notifications__new'}>{notificationLabel(item.kind)}</span>
              <Link to={`/portal/projects/${item.project_id}`}>Ver proyecto</Link></li>)}</ul> : <p className="portal-empty">Aún no hay novedades.</p>}
        </PortalState>
      </section>
    </div>
    <section className="portal-section" aria-labelledby="portal-projects-title"><div className="portal-section__heading">
      <h2 id="portal-projects-title">Tus proyectos</h2><Link to="/portal/projects">Ver todos</Link></div>
      <PortalState loading={projects.isLoading} error={projects.error}>
        {projects.data?.length ? <ProjectList projects={projects.data.slice(0, 3)} /> : <p className="portal-empty">Todavía no tienes proyectos asignados. Tu contacto de OMNIA puede darte acceso.</p>}
      </PortalState>
    </section>
    <section className="portal-section" aria-labelledby="portal-deliverables-title"><div className="portal-section__heading">
      <h2 id="portal-deliverables-title">Entregas recientes</h2></div>
      <PortalState loading={deliverables.isLoading} error={deliverables.error}>
        {deliverables.data?.length ? <DeliverableList items={deliverables.data.slice(0, 3)} /> : <p className="portal-empty">Aún no hay entregas publicadas para ti.</p>}
      </PortalState>
    </section>
  </div>
}

function notificationLabel(kind: string) {
  const labels: Record<string, string> = {
    deliverable_published: 'Nueva entrega publicada', approval_pending: 'Tienes una aprobación pendiente',
    client_approved: 'Entrega aprobada', client_changes_requested: 'Cambios solicitados',
  }
  return labels[kind] ?? 'Novedad del proyecto'
}
