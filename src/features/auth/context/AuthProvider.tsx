import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import {
  getSupabaseClient,
  type OmniaSupabaseClient,
} from '../../../shared/api/supabase/client'
import {
  acceptInvitation,
  AuthFlowError,
  loadAuthorizationProjection,
  requestPasswordRecovery,
  restoreVerifiedUser,
  signInWithPassword,
  signOut as signOutFromSupabase,
  updatePassword,
} from '../api/auth-service'
import {
  defaultRouteFor,
  hasAgencyContext,
  hasClientContext,
  hasProjectedCapability,
  routeAfterSignIn,
  type AuthenticatedActor,
  type AuthorizationProjection,
} from '../model/authorization'
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './AuthContext'

type AuthProviderProps = {
  children: ReactNode
  client?: OmniaSupabaseClient
}

function messageFrom(error: unknown): string {
  if (error instanceof AuthFlowError) {
    return error.message
  }

  return 'Ocurrió un problema inesperado. Intenta de nuevo.'
}

export function AuthProvider({
  children,
  client = getSupabaseClient(),
}: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [actor, setActor] = useState<AuthenticatedActor | null>(null)
  const [error, setError] = useState<string | null>(null)
  const operationVersion = useRef(0)
  const currentUserId = useRef<string | null>(null)
  const queryClient = useQueryClient()

  const clearSession = useCallback(() => {
    operationVersion.current += 1
    currentUserId.current = null
    void client.removeAllChannels()
    queryClient.clear()
    setSession(null)
    setActor(null)
    setError(null)
    setStatus('anonymous')
  }, [client, queryClient])

  const hydrateSession = useCallback(
    async (nextSession: Session): Promise<AuthorizationProjection> => {
      const version = operationVersion.current + 1
      operationVersion.current = version
      setStatus('loading')
      setError(null)

      try {
        const user = await restoreVerifiedUser(client, nextSession)
        const projection = await loadAuthorizationProjection(client, user.id)

        if (operationVersion.current === version) {
          if (currentUserId.current !== user.id) {
            void client.removeAllChannels()
            queryClient.clear()
            currentUserId.current = user.id
          }
          setSession(nextSession)
          setActor({ user, ...projection })
          setStatus('authenticated')
        }

        return projection
      } catch (caughtError) {
        if (operationVersion.current === version) {
          currentUserId.current = null
          void client.removeAllChannels()
          queryClient.clear()
          setSession(null)
          setActor(null)
          setError(messageFrom(caughtError))
          setStatus('error')
        }
        throw caughtError
      }
    },
    [client, queryClient],
  )

  useEffect(() => {
    let active = true

    const restore = async () => {
      const { data, error: sessionError } = await client.auth.getSession()
      if (!active) {
        return
      }

      if (sessionError) {
        setError('No pudimos restaurar tu sesión. Vuelve a iniciar sesión.')
        setStatus('error')
        return
      }

      if (!data.session) {
        clearSession()
        return
      }

      try {
        await hydrateSession(data.session)
      } catch {
        // hydrateSession exposes the safe user-facing error through context.
      }
    }

    void restore()

    const { data: authListener } = client.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active) {
          return
        }

        if (event === 'SIGNED_OUT' || !nextSession) {
          clearSession()
          return
        }

        window.setTimeout(() => {
          if (active) {
            void hydrateSession(nextSession).catch(() => undefined)
          }
        }, 0)
      },
    )

    return () => {
      active = false
      operationVersion.current += 1
      authListener.subscription.unsubscribe()
    }
  }, [clearSession, client, hydrateSession])

  const signIn = useCallback(
    async (email: string, password: string, requestedPath?: string) => {
      const nextSession = await signInWithPassword(client, email, password)
      const projection = await hydrateSession(nextSession)

      return routeAfterSignIn(projection, requestedPath)
    },
    [client, hydrateSession],
  )

  const signOut = useCallback(async () => {
    await signOutFromSupabase(client)
    clearSession()
  }, [clearSession, client])

  const sendRecovery = useCallback(
    async (email: string) => requestPasswordRecovery(client, email),
    [client],
  )

  const refreshAuthorization = useCallback(async () => {
    const { data } = await client.auth.getSession()
    if (!data.session) {
      clearSession()
      return null
    }

    return hydrateSession(data.session)
  }, [clearSession, client, hydrateSession])

  const savePassword = useCallback(
    async (password: string) => {
      await updatePassword(client, password)
      const projection = await refreshAuthorization()
      return projection ? defaultRouteFor(projection) : '/login'
    },
    [client, refreshAuthorization],
  )

  const acceptInvite = useCallback(
    async (invitationId: string, password: string) => {
      await updatePassword(client, password)
      await acceptInvitation(client, invitationId)
      const projection = await refreshAuthorization()
      return projection ? defaultRouteFor(projection) : '/login'
    },
    [client, refreshAuthorization],
  )

  const agencyContext = actor ? hasAgencyContext(actor) : false
  const clientContext = actor ? hasClientContext(actor) : false

  const hasCapability = useCallback(
    (capabilityKey: string, scopeId?: string) =>
      hasProjectedCapability(actor?.capabilities ?? [], capabilityKey, scopeId),
    [actor?.capabilities],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      actor,
      error,
      hasAgencyContext: agencyContext,
      hasClientContext: clientContext,
      signIn,
      signOut,
      sendRecovery,
      savePassword,
      acceptInvite,
      refreshAuthorization,
      hasCapability,
    }),
    [
      acceptInvite,
      actor,
      agencyContext,
      clientContext,
      error,
      hasCapability,
      refreshAuthorization,
      savePassword,
      sendRecovery,
      session,
      signIn,
      signOut,
      status,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
