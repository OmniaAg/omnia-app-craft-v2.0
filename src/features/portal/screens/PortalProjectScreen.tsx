import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { FileActions } from '../../files/ui/FileActions'
import { portalQueries } from '../api/queries'
import { DeliverableList, PortalHeading, PortalPager, PortalState } from '../ui/PortalPrimitives'
import { formatPortalDate, statusLabel } from '../ui/portal-format'

export function Component() {
  const { projectId = '' } = useParams()
  const [page, setPage] = useState(0)
  const project = useQuery({ ...portalQueries.project(projectId), enabled: Boolean(projectId) })
  const deliverables = useQuery({ ...portalQueries.deliverables(projectId, page), enabled: Boolean(projectId) })
  const documents = useQuery({ ...portalQueries.documents(projectId, 0), enabled: Boolean(projectId) })
  return <div className="portal-page"><Link className="portal-back" to="/portal/projects">← Todos los proyectos</Link>
    <PortalState loading={project.isLoading} error={project.error}>
      {project.data ? <><PortalHeading title={project.data.name} description={`${project.data.brand_name} · ${project.data.organization_name}`}>
        <span className="portal-badge">{statusLabel(project.data.status)}</span></PortalHeading>
        <div className="portal-project-facts"><span>Inicio: {formatPortalDate(project.data.start_date)}</span>
          <span>Fecha objetivo: {formatPortalDate(project.data.target_end_date)}</span></div>
        <section className="portal-section" aria-labelledby="portal-milestones-title"><h2 id="portal-milestones-title">Hitos y avance</h2>
          {project.data.milestones.length ? <ol className="portal-milestones">{project.data.milestones.map(item =>
            <li key={item.id}><span className="portal-badge">{statusLabel(item.status)}</span>
              <strong>{item.name}</strong><time>{formatPortalDate(item.due_date)}</time></li>)}</ol> :
            <p className="portal-empty">Todavía no hay hitos visibles para este proyecto.</p>}</section>
        <section className="portal-section" aria-labelledby="portal-project-deliverables-title"><h2 id="portal-project-deliverables-title">Entregas publicadas</h2>
          <PortalState loading={deliverables.isLoading} error={deliverables.error}>
            {deliverables.data?.length ? <><DeliverableList items={deliverables.data} />
              <PortalPager page={page} count={deliverables.data.length} onPage={setPage} /></> :
              <p className="portal-empty">Aún no hay entregas publicadas.</p>}
          </PortalState></section>
        <section className="portal-section" aria-labelledby="portal-project-documents-title"><div className="portal-section__heading">
          <h2 id="portal-project-documents-title">Documentos publicados</h2>
          <Link to={`/portal/documents?project=${projectId}`}>Ver todos</Link></div>
          <PortalState loading={documents.isLoading} error={documents.error}>
            {documents.data?.length ? <div className="portal-list">{documents.data.slice(0, 3).map(item =>
              <div className="portal-list__row" key={`${item.publication_id}-${item.asset_id}`}>
                <div><strong>{item.original_filename}</strong>
                  <p className="portal-list__detail">{item.deliverable_title} · Versión {item.version_number}</p></div>
                <FileActions asset={item} /></div>)}</div> :
              <p className="portal-empty">Aún no hay documentos publicados para este proyecto.</p>}
          </PortalState></section>
        <section className="portal-section" aria-labelledby="portal-activity-title"><h2 id="portal-activity-title">Actividad reciente</h2>
          {project.data.activity.length ? <ul className="portal-activity">{project.data.activity.map(item =>
            <li key={item.publication_id}><Link to={`/portal/deliverables/${item.publication_id}`}>{item.title}</Link>
              <span>Publicada el {formatPortalDate(item.published_at)} · {statusLabel(item.review_status)}</span></li>)}</ul> :
            <p className="portal-empty">La actividad aparecerá cuando se publique una entrega.</p>}</section>
      </> : null}</PortalState></div>
}
