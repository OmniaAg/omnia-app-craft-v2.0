import type { Session, User } from '@supabase/supabase-js'
import type { OmniaSupabaseClient } from '../../../shared/api/supabase/client'
import { getPublicEnv } from '../../../shared/config/env'
import type { AuthorizationProjection } from '../model/authorization'
import {
  invitationSchema,
  type InvitationInput,
} from '../model/schemas'

export class AuthFlowError extends Error {
  readonly code: string

  constructor(
    code: string,
    message: string,
  ) {
    super(message)
    this.code = code
    this.name = 'AuthFlowError'
  }
}

function throwAuthError(code: string | undefined, fallback: string): never {
  if (code === 'invalid_credentials' || code === 'email_not_confirmed') {
    throw new AuthFlowError(
      'invalid_credentials',
      'No pudimos verificar esas credenciales. Revisa el correo y la contraseña.',
    )
  }

  throw new AuthFlowError(code ?? 'auth_error', fallback)
}

export async function loadAuthorizationProjection(
  client: OmniaSupabaseClient,
  userId: string,
): Promise<AuthorizationProjection> {
  const [profileResult, agencyResult, clientResult, capabilitiesResult] =
    await Promise.all([
      client.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      client
        .from('agency_memberships')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active'),
      client
        .from('client_memberships')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active'),
      client.rpc('my_capabilities'),
    ])

  const firstError = [
    profileResult.error,
    agencyResult.error,
    clientResult.error,
    capabilitiesResult.error,
  ].find(Boolean)

  if (firstError) {
    throw new AuthFlowError(
      'authorization_projection_failed',
      'No pudimos cargar tu contexto de acceso. Intenta de nuevo.',
    )
  }

  return {
    profile: profileResult.data,
    agencyMemberships: agencyResult.data ?? [],
    clientMemberships: clientResult.data ?? [],
    capabilities: capabilitiesResult.data ?? [],
  }
}

export async function restoreVerifiedUser(
  client: OmniaSupabaseClient,
  session: Session,
): Promise<User> {
  const { data, error } = await client.auth.getUser()

  if (error || !data.user || data.user.id !== session.user.id) {
    throw new AuthFlowError(
      'session_verification_failed',
      'Tu sesión no pudo verificarse. Vuelve a iniciar sesión.',
    )
  }

  return data.user
}

export async function signInWithPassword(
  client: OmniaSupabaseClient,
  email: string,
  password: string,
): Promise<Session> {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.session) {
    throwAuthError(
      error?.code,
      'No pudimos iniciar la sesión. Intenta de nuevo.',
    )
  }

  return data.session
}

export async function requestPasswordRecovery(
  client: OmniaSupabaseClient,
  email: string,
): Promise<void> {
  const redirectTo = new URL('/reset-password', getPublicEnv().VITE_APP_URL)
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo.toString(),
  })

  if (error) {
    throw new AuthFlowError(
      error.code ?? 'recovery_failed',
      'No pudimos iniciar la recuperación. Espera un momento e intenta de nuevo.',
    )
  }
}

export async function updatePassword(
  client: OmniaSupabaseClient,
  password: string,
): Promise<void> {
  const { error } = await client.auth.updateUser({ password })

  if (error) {
    throw new AuthFlowError(
      error.code ?? 'password_update_failed',
      'No pudimos guardar la nueva contraseña. Revisa los requisitos e intenta de nuevo.',
    )
  }
}

export async function acceptInvitation(
  client: OmniaSupabaseClient,
  invitationId: string,
): Promise<string> {
  const { data, error } = await client.rpc('accept_invitation', {
    invitation_id: invitationId,
  })

  if (error || !data) {
    throw new AuthFlowError(
      error?.code ?? 'invitation_acceptance_failed',
      'La invitación no está disponible, ya fue utilizada o expiró.',
    )
  }

  return data
}

export async function signOut(
  client: OmniaSupabaseClient,
): Promise<void> {
  const { error } = await client.auth.signOut()

  if (error) {
    throw new AuthFlowError(
      error.code ?? 'sign_out_failed',
      'No pudimos cerrar la sesión. Intenta de nuevo.',
    )
  }
}

export async function inviteUser(
  client: OmniaSupabaseClient,
  input: InvitationInput,
): Promise<{ invitationId: string; replay: boolean }> {
  const body = invitationSchema.parse(input)
  const { data, error } = await client.functions.invoke('invite-user', { body })

  if (error || !data?.invitationId) {
    throw new AuthFlowError(
      'invitation_dispatch_failed',
      'No pudimos enviar la invitación. Revisa el scope e intenta de nuevo.',
    )
  }

  return {
    invitationId: String(data.invitationId),
    replay: Boolean(data.replay),
  }
}
