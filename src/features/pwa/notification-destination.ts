import type { Notification } from '../messaging/api/messaging-service'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const safePushPath = (path: unknown): path is string => typeof path==='string' && /^\/(app|portal)\/push\/[0-9a-f-]{36}$/i.test(path) && uuid.test(path.split('/')[3])
export function notificationDestination(item: Notification, base:'/app'|'/portal'): string {
  if (item.kind==='message_received' && item.channel_id && uuid.test(item.channel_id)) return `${base}/messages/${item.channel_id}`
  if (item.kind==='approval_pending') {
    if (base==='/portal' && item.publication_id && uuid.test(item.publication_id)) return `/portal/deliverables/${item.publication_id}`
    return base==='/portal' ? '/portal/approvals' : '/app/reviews'
  }
  if (base==='/portal' && item.publication_id && uuid.test(item.publication_id)) return `/portal/deliverables/${item.publication_id}`
  if (base==='/app' && item.work_item_id && uuid.test(item.work_item_id)) return `/app/deliverables/${item.work_item_id}`
  if (item.project_id && uuid.test(item.project_id)) return `${base}/projects/${item.project_id}`
  return `${base}/notifications`
}
