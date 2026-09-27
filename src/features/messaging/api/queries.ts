import { queryOptions } from '@tanstack/react-query'
import { getNotificationPreferences, listChannels, listMessages, listNotifications,
  unreadNotificationCount, type Message } from './messaging-service'

export const messagingKeys = {
  channels: ['messaging', 'channels'] as const,
  messages: (id: string, cursor?: Pick<Message, 'created_at' | 'id'>) =>
    ['messaging', 'messages', id, cursor?.created_at ?? 'latest', cursor?.id ?? ''] as const,
  notifications: (page: number) => ['messaging', 'notifications', page] as const,
  unread: ['messaging', 'notifications', 'unread'] as const,
  preferences: (userId: string) => ['messaging', 'preferences', userId] as const,
}
export const messagingQueries = {
  channels: () => queryOptions({ queryKey: messagingKeys.channels, queryFn: listChannels }),
  messages: (id: string, cursor?: Pick<Message, 'created_at' | 'id'>) => queryOptions({
    queryKey: messagingKeys.messages(id, cursor), queryFn: () => listMessages(id, cursor),
  }),
  notifications: (page: number) => queryOptions({ queryKey: messagingKeys.notifications(page), queryFn: () => listNotifications(page) }),
  unread: () => queryOptions({ queryKey: messagingKeys.unread, queryFn: unreadNotificationCount }),
  preferences: (userId: string) => queryOptions({ queryKey: messagingKeys.preferences(userId), queryFn: () => getNotificationPreferences(userId) }),
}
