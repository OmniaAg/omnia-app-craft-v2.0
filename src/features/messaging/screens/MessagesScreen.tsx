import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/context/AuthContext'
import { listMessages, markChannelRead, sendMessage } from '../api/messaging-service'
import { messagingKeys, messagingQueries } from '../api/queries'
import { useMessageRealtime } from '../ui/useMessagingRealtime'
import { ChannelMembershipManager } from '../ui/ChannelMembershipManager'
import '../ui/messaging.css'

export function Component() {
  const { channelId } = useParams()
  const auth = useAuth()
  const base = auth.hasAgencyContext && location.pathname.startsWith('/app') ? '/app' : '/portal'
  const channels = useQuery(messagingQueries.channels())
  const selected = channels.data?.find(channel => channel.id === channelId)
  const selectedId = selected?.id
  const queryClient = useQueryClient()
  const connected = useMessageRealtime(selectedId)
  const [body, setBody] = useState('')
  const [sendError, setSendError] = useState('')
  const [sending, setSending] = useState(false)
  const pendingId = useRef<string | null>(null)
  const messages = useInfiniteQuery({
    queryKey: ['messaging', 'messages', channelId],
    queryFn: ({ pageParam }) => listMessages(channelId!, pageParam ?? undefined),
    initialPageParam: undefined as { created_at: string; id: string } | undefined,
    getNextPageParam: lastPage => lastPage.length === 30
      ? { created_at: lastPage[lastPage.length - 1].created_at, id: lastPage[lastPage.length - 1].id }
      : undefined,
    enabled: Boolean(channelId && selected),
  })
  const latestId = messages.data?.pages[0]?.[0]?.id
  useEffect(() => {
    if (!channelId || !selectedId || !latestId) return
    void markChannelRead(channelId).then(() => queryClient.invalidateQueries({ queryKey: messagingKeys.channels }))
  }, [channelId, latestId, queryClient, selectedId])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!channelId || !body.trim() || sending) return
    setSending(true)
    setSendError('')
    pendingId.current ??= crypto.randomUUID()
    try {
      await sendMessage(channelId, body, pendingId.current)
      pendingId.current = null
      setBody('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messaging', 'messages', channelId] }),
        queryClient.invalidateQueries({ queryKey: messagingKeys.channels }),
      ])
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'No pudimos enviar el mensaje.')
    } finally { setSending(false) }
  }

  const ordered = messages.data?.pages.flatMap(page => page).reverse() ?? []
  return <div className="messaging-page">
    <header className="messaging-heading"><div><h1 data-route-heading tabIndex={-1}>Mensajes</h1>
      <p>Conversaciones con tu equipo y clientes.</p></div>
      <Link to={`${base}/notifications`}>Notificaciones</Link></header>
    <div className="messaging-layout">
      <nav className="messaging-channels" aria-label="Canales">
        <h2>Canales</h2>
        {channels.isLoading ? <p>Cargando canales…</p> : null}
        {channels.error ? <p role="alert">No pudimos cargar los canales.</p> : null}
        {channels.data?.length === 0 ? <p>Aún no tienes canales.</p> : null}
        {channels.data?.map(channel => <Link key={channel.id} to={`${base}/messages/${channel.id}`}
          aria-current={channel.id === channelId ? 'page' : undefined}
          className={channel.id === channelId ? 'messaging-channel is-active' : 'messaging-channel'}>
          <span className="messaging-channel__type">{channel.kind === 'organization' ? 'Organization' : 'Proyecto'}</span>
          <strong>{channel.label}</strong>
          <span>{channel.last_message_preview ?? 'Sin mensajes todavía'}</span>
          {channel.unread_count > 0 ? <em>{channel.unread_count} sin leer</em> : null}
        </Link>)}
      </nav>
      <section className="messaging-conversation" aria-label="Conversación">
        {!channelId ? <p className="messaging-placeholder">Elige un canal para ver sus mensajes.</p> : null}
        {channelId && channels.isLoading ? <p>Cargando conversación…</p> : null}
        {channelId && !channels.isLoading && !selected ? <p role="alert">Canal no disponible.</p> : null}
        {selected ? <>
          <header className="messaging-conversation__header"><div><h2>{selected.label}</h2>
            <span>{selected.kind === 'organization' ? 'Canal general' : 'Canal de proyecto'}</span></div>
            <span role="status">{connected ? 'En vivo' : 'Reconectando…'}</span></header>
          <ChannelMembershipManager channel={selected} />
          <div className="messaging-history" role="log" aria-label="Historial de mensajes" aria-live="polite">
            {messages.hasNextPage ? <button type="button" disabled={messages.isFetchingNextPage}
              onClick={() => void messages.fetchNextPage()}>Cargar anteriores</button> : null}
            {messages.isLoading ? <p>Cargando mensajes…</p> : null}
            {messages.error ? <p role="alert">No pudimos cargar los mensajes. Comprueba tu acceso al canal.</p> : null}
            {!messages.isLoading && !messages.error && ordered.length === 0 ? <p>Inicia la conversación.</p> : null}
            {ordered.map(message => <article className="messaging-message" key={message.id}
              data-own={message.author_user_id === auth.actor?.user.id}>
              <div><strong>{message.author_user_id === auth.actor?.user.id ? 'Tú' : message.author_name}</strong>
                <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString('es-MX')}</time></div>
              <p>{message.body}</p></article>)}
          </div>
          <form className="messaging-composer" onSubmit={event => void submit(event)}>
            <label htmlFor="message-body">Mensaje</label>
            <textarea id="message-body" value={body} maxLength={4000} rows={3}
              onChange={event => { setBody(event.target.value); pendingId.current = null }}
              placeholder="Escribe un mensaje" />
            <div><span aria-live="polite">{sendError || (sending ? 'Enviando…' : `${body.length}/4000`)}</span>
              <button type="submit" disabled={sending || !body.trim()}>Enviar</button></div>
          </form>
        </> : null}
      </section>
    </div>
  </div>
}
