import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/context/AuthContext'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { messagingKeys } from '../api/queries'

export function useNotificationRealtime() {
  const userId = useAuth().actor?.user.id
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!userId) return
    const client = getSupabaseClient()
    const channel = client.channel(`notifications:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ['messaging', 'notifications'] })
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          void queryClient.invalidateQueries({ queryKey: ['messaging', 'notifications'] })
        }
      })
    return () => { void client.removeChannel(channel) }
  }, [queryClient, userId])
}

export function useMessageRealtime(channelId?: string) {
  const userId = useAuth().actor?.user.id
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!userId || !channelId) return
    const client = getSupabaseClient()
    const channel = client.channel(`messages:${userId}:${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ['messaging', 'messages', channelId] })
        void queryClient.invalidateQueries({ queryKey: messagingKeys.channels })
      })
      .subscribe(status => {
        setConnected(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') {
          void queryClient.invalidateQueries({ queryKey: ['messaging', 'messages', channelId] })
          void queryClient.invalidateQueries({ queryKey: messagingKeys.channels })
        }
      })
    return () => { void client.removeChannel(channel) }
  }, [channelId, queryClient, userId])
  return connected
}
