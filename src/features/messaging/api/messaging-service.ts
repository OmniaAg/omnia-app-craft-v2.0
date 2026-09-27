import type { Database } from '../../../shared/api/supabase/database.types'
import { getSupabaseClient } from '../../../shared/api/supabase/client'

type Functions = Database['public']['Functions']
export type Channel = Functions['my_channels']['Returns'][number]
export type Message = Functions['channel_messages']['Returns'][number]
export type Notification = Pick<Database['public']['Tables']['notifications']['Row'],
  'id' | 'kind' | 'project_id' | 'deliverable_id' | 'publication_id' | 'work_item_id' |
  'channel_id' | 'message_id' | 'created_at' | 'read_at'>
export type NotificationPreferences = Pick<Database['public']['Tables']['notification_preferences']['Row'],
  'messages' | 'approvals' | 'deliverable_updates'>

function result<T>(data: T | null, error: { message: string } | null): T {
  if (error || data === null) throw new Error(error?.message ?? 'No pudimos completar la solicitud.')
  return data
}

export async function listChannels() {
  const { data, error } = await getSupabaseClient().rpc('my_channels')
  return result(data, error)
}

export async function listMessages(channelId: string, cursor?: Pick<Message, 'created_at' | 'id'>) {
  const { data, error } = await getSupabaseClient().rpc('channel_messages', {
    p_channel: channelId, p_limit: 30,
    p_before_at: cursor?.created_at ?? undefined,
    p_before_id: cursor?.id ?? undefined,
  })
  return result(data, error)
}

export async function sendMessage(channelId: string, body: string, clientMessageId: string) {
  const { data, error } = await getSupabaseClient().rpc('send_message', {
    p_channel: channelId, p_body: body, p_client_message_id: clientMessageId,
  })
  return result(data, error)
}

export async function markChannelRead(channelId: string) {
  const { error } = await getSupabaseClient().rpc('mark_channel_read', { p_channel: channelId })
  if (error) throw new Error(error.message)
}

export async function createProjectChannel(projectId: string) {
  const { data, error } = await getSupabaseClient().rpc('create_project_channel', { p_project: projectId })
  return result(data, error)
}

export async function listChannelMembers(channelId: string) {
  const { data, error } = await getSupabaseClient().rpc('channel_members', { p_channel: channelId })
  return result(data, error)
}

export async function addChannelMember(channelId: string, userId: string) {
  const { error } = await getSupabaseClient().rpc('add_channel_member', { p_channel: channelId, p_user: userId })
  if (error) throw new Error(error.message)
}

export async function removeChannelMember(channelId: string, userId: string) {
  const { error } = await getSupabaseClient().rpc('remove_channel_member', { p_channel: channelId, p_user: userId })
  if (error) throw new Error(error.message)
}

export async function listNotifications(page = 0) {
  const { data, error } = await getSupabaseClient().from('notifications')
    .select('id,kind,project_id,deliverable_id,publication_id,work_item_id,channel_id,message_id,created_at,read_at')
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(page * 20, page * 20 + 19)
  return result(data, error) as Notification[]
}

export async function unreadNotificationCount() {
  const { count, error } = await getSupabaseClient().from('notifications')
    .select('id', { count: 'exact', head: true }).is('read_at', null)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function markNotificationRead(id: string) {
  const { error } = await getSupabaseClient().rpc('mark_portal_notification_read', { notification_id: id })
  if (error) throw new Error(error.message)
}

export async function markAllNotificationsRead() {
  const { error } = await getSupabaseClient().rpc('mark_all_notifications_read')
  if (error) throw new Error(error.message)
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const { data, error } = await getSupabaseClient().from('notification_preferences')
    .select('messages,approvals,deliverable_updates').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ?? { messages: true, approvals: true, deliverable_updates: true }
}

export async function saveNotificationPreferences(userId: string, preferences: NotificationPreferences) {
  const { error } = await getSupabaseClient().from('notification_preferences')
    .upsert({ user_id: userId, ...preferences, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}
