import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/context/AuthContext'
import { analyticsQueries } from '../../analytics/api'
import { period } from '../../analytics/model'

export default function OperationalOverview() {
  const auth=useAuth()
  const [filters]=useState(()=>period(30))
  const query=useQuery(analyticsQueries.overview(auth.actor!.user.id,filters))
  if(query.isPending)return <p role="status">Cargando prioridades del equipo…</p>
  if(query.isError)return <div role="alert">No pudimos cargar las prioridades. <button type="button" onClick={()=>void query.refetch()}>Reintentar prioridades</button></div>
  const data=query.data
  return <section className="dashboard-priorities" aria-labelledby="priorities-title">
    <div><h2 id="priorities-title">Atención del equipo</h2><p>Proyectos y trabajo dentro de tu acceso.</p></div>
    <div className="dashboard-priorities__metrics">
      <Link to="/app/projects"><strong>{data.active_projects}</strong><span>Proyectos activos</span></Link>
      <Link to="/app/analytics?section=work&detail=overdue"><strong>{data.overdue_work}</strong><span>Trabajos vencidos</span></Link>
      <Link to="/app/reviews"><strong>{data.pending_internal}</strong><span>Revisiones internas</span></Link>
      <Link to="/app/analytics?section=reviews"><strong>{data.pending_client}</strong><span>Decisiones de cliente</span></Link>
    </div>
    {data.open_work>0?<div className="dashboard-progress"><label htmlFor="team-overdue">Trabajo vencido: {data.overdue_work} de {data.open_work} abiertos</label><meter id="team-overdue" min={0} max={data.open_work} value={data.overdue_work}>{data.overdue_work} de {data.open_work}</meter></div>:<p>No hay trabajo abierto en este alcance.</p>}
    <small>Fuente: Analytics operativo. Estado actual; no representa el porcentaje de avance del proyecto.</small>
  </section>
}
