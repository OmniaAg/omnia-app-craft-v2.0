import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type {
  AuthenticatedActor,
  AuthorizationProjection,
} from '../model/authorization'

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error'

export type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  actor: AuthenticatedActor | null
  error: string | null
  hasAgencyContext: boolean
  hasClientContext: boolean
  signIn: (
    email: string,
    password: string,
    requestedPath?: string,
  ) => Promise<string>
  signOut: () => Promise<void>
  sendRecovery: (email: string) => Promise<void>
  savePassword: (password: string) => Promise<string>
  acceptInvite: (invitationId: string, password: string) => Promise<string>
  refreshAuthorization: () => Promise<AuthorizationProjection | null>
  hasCapability: (capabilityKey: string, scopeId?: string) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe utilizarse dentro de AuthProvider.')
  }
  return context
}
