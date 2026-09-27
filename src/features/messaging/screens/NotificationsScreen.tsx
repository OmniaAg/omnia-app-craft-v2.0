import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/context/AuthContext'
import { markAllNotificationsRead, markNotificationRead, type Notification } from '../api/messaging-service'
import { messagingKeys, messagingQueries } from '../api/queries'
import '../ui/messaging.css'

function destination(item: Notification, base: string) {
  if (item.kind === 'message_received' && item.channel_id) return `${base}/messages/${item.channel_id}`
  if (item.kind === 'approval_pending') {
    if (base === '/portal' && item.publication_id) return `/portal/deliverables/${item.publication_id}`
    return base === '/portal' ? '/portal/approvals' : '/app/reviews'
  }
  if (base === '/portal' && item.publication_id) return `/portal/deliverables/${item.publication_id}`
  if (base === '/app' && item.work_item_id) return `/app/deliverables/${item.work_item_id}`
  if (item.project_id) return `${base}/projects/${item.project_id}`
  return `${base}/notifications`
}

function title(kind: string) {
  const labels: Record<string, string> = {
    message_received: 'Nuevo mensaje', approval_pending: 'Aprobación pendiente',
    deliverable_published: 'Nueva entrega publicada', client_approved: 'Entrega aprobada',
    client_changes_requested: 'Cambios solicitados',
  }
  return labels[kind] ?? 'Novedad'
}

export function Component() {
  const auth = useAuth()
  const base = location.pathname.startsWith('/app') ? '/app' : '/portal'
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const notifications = useQuery(messagingQueries.notifications(page))
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const preferences = useQuery(messagingQueries.preferences(auth.actor?.user.id ?? ''))

  async function open(item: Notification) {
    try {
      if (!item.read_at) await markNotificationRead(item.id)
      await queryClient.invalidateQueries({ queryKey: ['messaging', 'notifications'] })
      navigate(destination(item, base))
    } catch { setError('No pudimos abrir la notificación.') }
  }

  async function markAll() {
    try {
      await markAllNotificationsRead()
      await queryClient.invalidateQueries({ queryKey: ['messaging', 'notifications'] })
    } catch { setError('No pudimos marcar las notificaciones.') }
  }

  async function toggle(key: 'messages' | 'approvals' | 'deliverable_updates') {
    if (!auth.actor || !preferences.data) return
    const { saveNotificationPreferences } = await import('../api/messaging-service')
    try {
      await saveNotificationPreferences(auth.actor.user.id, { ...preferences.data, [key]: !preferences.data[key] })
      await queryClient.invalidateQueries({ queryKey: messagingKeys.preferences(auth.actor.user.id) })
    } catch { setError('No pudimos guardar tus preferencias.') }
  }

  return <div className="messaging-page messaging-page--notifications">
    <header className="messaging-heading"><div><h1 data-route-heading tabIndex={-1}>Notificaciones</h1>
      <p>Novedades de tus conversaciones y proyectos.</p></div>
      <Link to={`${base}/messages`}>Ver mensajes</Link></header>
    {error ? <p role="alert">{error}</p> : null}
    <section className="messaging-notification-list" aria-label="Notificaciones">
      <div className="messaging-list-actions"><h2>Bandeja</h2>
        <button type="button" onClick={() => void markAll()}>Marcar todas como leídas</button></div>
      {notifications.isLoading ? <p>Cargando notificaciones…</p> : null}
      {notifications.error ? <p role="alert">No pudimos cargar las notificaciones.</p> : null}
      {notifications.data?.length === 0 ? <p>No tienes notificaciones.</p> : null}
      {notifications.data?.map(item => <article key={item.id} className="messaging-notification" data-unread={!item.read_at}>
        <div><strong>{title(item.kind)}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('es-MX')}</time></div>
        <button type="button" onClick={() => void open(item)}>Abrir</button>
      </article>)}
      {page > 0 ? <button type="button" onClick={() => setPage(page - 1)}>Anterior</button> : null}
      {notifications.data?.length === 20 ? <button type="button" onClick={() => setPage(page + 1)}>Siguiente</button> : null}
    </section>
    <section className="messaging-notification-list" aria-label="Preferencias de notificación">
      <h2>Preferencias</h2>
      {preferences.data ? <div className="messaging-preferences">{([
        ['messages','Mensajes'],['approvals','Aprobaciones'],['deliverable_updates','Actualizaciones de entregas'],
      ] as const).map(([key,label]) => <label key={key}><input type="checkbox"
        checked={preferences.data[key]} onChange={() => void toggle(key)} /> {label}</label>)}</div> : null}
    </section>
  </div>
}
