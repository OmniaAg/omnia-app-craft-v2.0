import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { getSupabaseClient } from '../../shared/api/supabase/client'
import { useAuth } from '../auth/context/AuthContext'
import { notificationDestination, safePushPath } from './notification-destination'
export function Component() {
  const {notificationId}=useParams(), location=useLocation(), auth=useAuth()
  const base=location.pathname.startsWith('/app/') ? '/app' : '/portal'
  const notification=useQuery({queryKey:['messaging','push',auth.actor?.user.id,notificationId],
    enabled:safePushPath(location.pathname),retry:false,
    queryFn:async () => {
      const {data,error}=await getSupabaseClient().from('notifications')
        .select('id,kind,project_id,deliverable_id,publication_id,work_item_id,channel_id,message_id,created_at,read_at')
        .eq('id',notificationId!).maybeSingle()
      if (error) throw new Error('notification_unavailable')
      return data
    },
  })
  if (notification.data) return <Navigate replace to={notificationDestination(notification.data,base)} />
  return <div className="device-page"><h1 data-route-heading tabIndex={-1}>Notificación</h1>
    {notification.isLoading ? <p role="status">Consultando tu notificación…</p>
      : <><p role="status">Esta notificación no está disponible para tu sesión. Comprueba tu conexión y acceso.</p>
        <Link to={`${base}/notifications`}>Ir a mis notificaciones</Link></>}</div>
}
