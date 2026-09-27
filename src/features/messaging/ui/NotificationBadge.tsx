import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { messagingQueries } from '../api/queries'
import { useNotificationRealtime } from './useMessagingRealtime'

export function NotificationBadge() {
  useNotificationRealtime()
  const location = useLocation()
  const unread = useQuery(messagingQueries.unread())
  const destination = location.pathname.startsWith('/app') ? '/app/notifications' : '/portal/notifications'
  return unread.data ? <Link to={destination} className="notification-badge"
    aria-label={`${unread.data} notificaciones sin leer`}>{unread.data}</Link> : null
}
