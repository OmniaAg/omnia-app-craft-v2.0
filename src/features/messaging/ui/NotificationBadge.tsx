import { useQuery } from '@tanstack/react-query'
import { messagingQueries } from '../api/queries'
import { useNotificationRealtime } from './useMessagingRealtime'
import './notification-badge.css'

export function NotificationBadge() {
  useNotificationRealtime()
  const unread = useQuery(messagingQueries.unread())
  return unread.data ? <span className="notification-badge" role="status"
    aria-label={`${unread.data} notificaciones sin leer`}>{unread.data}</span> : null
}
