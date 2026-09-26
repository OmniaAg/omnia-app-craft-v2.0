import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CrmEmpty, CrmError, CrmPageHeader, StatusBadge } from '../../crm/ui/CrmUi'
import { reviewQueueQuery } from '../api/queries'
import '../ui/reviews.css'
import '../../crm/ui/crm.css'

const dateTime = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City',
})

export function Component() {
  const [page, setPage] = useState(0)
  const queue = useQuery(reviewQueueQuery(page))
  return <section className="crm-page reviews-page">
    <CrmPageHeader title="Mis revisiones" description="Entregas internas que necesitan tu decisión." />
    {queue.isPending ? <p role="status">Cargando revisiones…</p> : null}
    {queue.error ? <CrmError message={queue.error.message} /> : null}
    {queue.data?.length === 0 ? <CrmEmpty title="Sin revisiones pendientes" description="Las nuevas rondas asignadas aparecerán aquí." /> : null}
    {queue.data && queue.data.length > 0 ? <ul className="review-queue">
      {queue.data.map((item) => <li key={item.assignment_id}>
        <div><strong>{item.deliverable_title}</strong><span>{item.brand_name} · {item.project_name}</span>
          <span>{item.work_title} · Versión {item.version_number}</span>
          <time dateTime={item.submitted_at}>{dateTime.format(new Date(item.submitted_at))}</time>
        </div>
        <div><StatusBadge value={item.assignment_status} /><Link className="crm-row-link" to={`/app/deliverables/${item.work_item_id}`}>Revisar</Link></div>
      </li>)}
    </ul> : null}
    {page > 0 || (queue.data?.length ?? 0) === 50 ? <nav className="review-pagination" aria-label="Páginas de revisiones">
      <button className="crm-button" type="button" disabled={page === 0 || queue.isPending} onClick={() => setPage((value) => value - 1)}>Anterior</button>
      <span>Página {page + 1}</span>
      <button className="crm-button" type="button" disabled={queue.isPending || (queue.data?.length ?? 0) < 50} onClick={() => setPage((value) => value + 1)}>Siguiente</button>
    </nav> : null}
  </section>
}
