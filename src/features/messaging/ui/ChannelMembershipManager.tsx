import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { useAuth } from '../../auth/context/AuthContext'
import { listProjectMembers } from '../../projects/api/project-service'
import { addChannelMember, listChannelMembers, removeChannelMember, type Channel } from '../api/messaging-service'

export function ChannelMembershipManager({ channel }: { channel: Channel }) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [busyUser, setBusyUser] = useState<string | null>(null)
  const [error, setError] = useState('')
  const allowed = auth.hasAgencyContext && auth.hasCapability('channel.manage_members')
  const memberships = useQuery({
    queryKey: ['messaging', 'members', channel.id], queryFn: () => listChannelMembers(channel.id),
    enabled: allowed && channel.kind === 'project',
  })
  const candidates = useQuery({
    queryKey: ['messaging', 'project-members', channel.project_id],
    queryFn: () => listProjectMembers(getSupabaseClient(), channel.project_id!),
    enabled: allowed && channel.kind === 'project' && Boolean(channel.project_id),
  })
  if (!allowed || channel.kind !== 'project') return null

  async function change(userId: string, add: boolean) {
    setBusyUser(userId)
    setError('')
    try {
      if (add) await addChannelMember(channel.id, userId)
      else await removeChannelMember(channel.id, userId)
      await queryClient.invalidateQueries({ queryKey: ['messaging', 'members', channel.id] })
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos actualizar el canal.') }
    finally { setBusyUser(null) }
  }

  return <details className="messaging-member-manager"><summary>Miembros del canal</summary>
    <p>La membresía del proyecto no añade a una persona al canal. Selecciona quién puede participar.</p>
    {memberships.isLoading || candidates.isLoading ? <p>Cargando miembros…</p> : null}
    {memberships.error || candidates.error ? <p role="alert">No pudimos cargar los miembros.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <ul>{candidates.data?.filter(person => person.status === 'active').map(person => {
      const active = memberships.data?.some(member => member.user_id === person.user_id && member.status === 'active')
      return <li key={person.user_id}><span>{person.display_name} · {person.member_type === 'client' ? 'Cliente' : 'Interno'}</span>
        <button type="button" disabled={busyUser === person.user_id || person.user_id === auth.actor?.user.id && active}
          onClick={() => void change(person.user_id, !active)}>{active ? 'Quitar' : 'Añadir'}</button></li>
    })}</ul>
  </details>
}
