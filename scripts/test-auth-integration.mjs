import { randomBytes, randomUUID } from 'node:crypto'
import { TEST_PASSWORD } from './test-fixtures/credentials.mjs'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'

const DIRECTOR_ID = '10000000-0000-0000-0000-000000000001'
const DIRECTOR_EMAIL = 'director@omnia.local'
const AGENCY_ID = '20000000-0000-0000-0000-000000000001'
const ORGANIZATION_A = '30000000-0000-0000-0000-00000000000a'
const APP_ORIGIN = 'http://localhost:53170'

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function authFailure(label, error) {
  const status = error?.status ?? 'unknown-status'
  const code = error?.code ?? 'unknown-code'
  throw new Error(`${label} (${status}/${code})`)
}

function localUrl(value, expectedPort, label) {
  const url = new URL(value)
  invariant(
    ['127.0.0.1', 'localhost'].includes(url.hostname),
    `${label} must use a loopback host`,
  )
  invariant(url.port === expectedPort, `${label} uses an unexpected port`)
  return url
}

function password() {
  return TEST_PASSWORD
}

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

function browserClient(apiUrl, publishableKey, storage = memoryStorage()) {
  return createClient(apiUrl, publishableKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

async function invite(apiUrl, publishableKey, client, body, origin) {
  const { data, error } = await client.auth.getSession()
  invariant(!error && data.session, 'caller session is unavailable')

  const response = await fetch(`${apiUrl}/functions/v1/invite-user`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${data.session.access_token}`,
      'content-type': 'application/json',
      origin,
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

async function waitForMail(mailpitUrl, recipient, sentAfter = 0) {
  const deadline = Date.now() + 20_000

  while (Date.now() < deadline) {
    const response = await fetch(new URL('/api/v1/messages', mailpitUrl))
    invariant(response.ok, 'Mailpit message list is unavailable')
    const list = await response.json()
    const message = list.messages?.find((candidate) =>
      new Date(candidate.Created).getTime() >= sentAfter - 1000 && candidate.To?.some(
        (address) => address.Address?.toLowerCase() === recipient.toLowerCase(),
      ),
    )

    if (message) {
      const detailResponse = await fetch(
        new URL(`/api/v1/message/${message.ID}`, mailpitUrl),
      )
      invariant(detailResponse.ok, 'Mailpit message detail is unavailable')
      return detailResponse.json()
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }

  throw new Error('expected local Auth email was not captured by Mailpit')
}

function actionLink(message) {
  const content = [message.Text ?? '', message.HTML ?? ''].join('\n')
  const match = content.match(
    /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/i,
  )
  invariant(match, 'Mailpit message does not contain an Auth action link')
  return match[0]
    .replaceAll('&amp;', '&')
    .replaceAll('&#38;', '&')
}

async function sessionFromActionLink(client, link) {
  const actionUrl = new URL(link)
  localUrl(actionUrl.toString(), '56321', 'Auth action link')

  const response = await fetch(actionUrl, { redirect: 'manual' })
  invariant(
    [301, 302, 303, 307, 308].includes(response.status),
    'Auth action link did not redirect to the application',
  )
  const location = response.headers.get('location')
  invariant(location, 'Auth action link has no redirect location')

  const redirect = new URL(location, APP_ORIGIN)
  invariant(redirect.origin === APP_ORIGIN, 'Auth redirect left the local app origin')
  const fragment = new URLSearchParams(redirect.hash.slice(1))
  const accessToken = fragment.get('access_token')
  const refreshToken = fragment.get('refresh_token')
  invariant(accessToken && refreshToken, 'Auth redirect did not contain a session')

  const { data, error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  invariant(!error && data.session, 'invited user session could not be established')
}

async function acceptInvitation({
  apiUrl,
  publishableKey,
  mailpitUrl,
  email,
  invitationId,
}) {
  const storage = memoryStorage()
  const client = browserClient(apiUrl, publishableKey, storage)
  const message = await waitForMail(mailpitUrl, email)
  await sessionFromActionLink(client, actionLink(message))

  const { error: passwordError } = await client.auth.updateUser({
    password: password(),
  })
  invariant(!passwordError, 'invited user could not set a password')

  const { data: membershipId, error: acceptanceError } = await client.rpc(
    'accept_invitation',
    { invitation_id: invitationId },
  )
  invariant(!acceptanceError && membershipId, 'invitation acceptance failed')

  return { client, storage }
}

async function main() {
  const { status } = await waitForPostgrest()
  const apiUrl = localUrl(status.API_URL, '56321', 'Supabase API').origin
  const mailpitUrl = localUrl(status.MAILPIT_URL, '56324', 'Mailpit').origin
  invariant(status.PUBLISHABLE_KEY, 'local publishable key is unavailable')
  invariant(status.SECRET_KEY, 'local server key is unavailable')

  const admin = createClient(apiUrl, status.SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: bootstrapError } = await admin.auth.admin.updateUserById(
    DIRECTOR_ID,
    { password: password(), email_confirm: true },
  )
  if (bootstrapError) authFailure('director bootstrap failed', bootstrapError)
  console.log('ok - controlled local director bootstrap')

  const directorStorage = memoryStorage()
  const director = browserClient(apiUrl, status.PUBLISHABLE_KEY, directorStorage)
  const directorPassword = password()
  const { error: rotateError } = await admin.auth.admin.updateUserById(
    DIRECTOR_ID,
    { password: directorPassword },
  )
  if (rotateError) authFailure('director password rotation failed', rotateError)
  const { data: login, error: loginError } = await director.auth.signInWithPassword({
    email: DIRECTOR_EMAIL,
    password: directorPassword,
  })
  invariant(!loginError && login.user?.id === DIRECTOR_ID, 'director login failed')
  console.log('ok - director login')

  const recovery = browserClient(apiUrl, status.PUBLISHABLE_KEY)
  const recoveryRequestedAt = Date.now()
  const { error: recoveryRequestError } =
    await recovery.auth.resetPasswordForEmail(DIRECTOR_EMAIL, {
      redirectTo: `${APP_ORIGIN}/reset-password`,
    })
  invariant(!recoveryRequestError, 'password recovery request failed')
  const recoveryMail = await waitForMail(mailpitUrl, DIRECTOR_EMAIL, recoveryRequestedAt)
  await sessionFromActionLink(recovery, actionLink(recoveryMail))
  const recoveredDirectorPassword = `${TEST_PASSWORD}${randomBytes(8).toString('hex')}`
  const { error: recoveryUpdateError } = await recovery.auth.updateUser({
    password: recoveredDirectorPassword,
  })
  invariant(!recoveryUpdateError, `password recovery update failed: ${recoveryUpdateError?.message ?? ''}`)
  const { error: recoveryLogoutError } = await recovery.auth.signOut()
  invariant(!recoveryLogoutError, 'password recovery session logout failed')
  const { error: reloginError } = await director.auth.signInWithPassword({
    email: DIRECTOR_EMAIL,
    password: recoveredDirectorPassword,
  })
  invariant(!reloginError, 'director reauthentication after recovery failed')
  console.log('ok - password recovery through Mailpit')

  const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`
  const anonymousFunctionCall = await fetch(
    `${apiUrl}/functions/v1/invite-user`,
    {
      method: 'POST',
      headers: {
        apikey: status.PUBLISHABLE_KEY,
        'content-type': 'application/json',
        origin: APP_ORIGIN,
      },
      body: '{}',
    },
  )
  invariant(
    anonymousFunctionCall.status === 401,
    `Edge Function accepted a missing user JWT (${anonymousFunctionCall.status})`,
  )
  const blocked = await invite(
    apiUrl,
    status.PUBLISHABLE_KEY,
    director,
    {
      kind: 'internal',
      email: `blocked-${runId}@omnia.local`,
      agencyRoleKey: 'contributor',
      departmentKey: 'LUX',
      classification: 'employee',
      idempotencyKey: randomUUID(),
    },
    'https://untrusted.example',
  )
  invariant(
    blocked.response.status === 403,
    `untrusted CORS origin was not rejected (${blocked.response.status})`,
  )
  invariant(
    blocked.response.headers.get('access-control-allow-origin') !==
      'https://untrusted.example',
    'untrusted CORS origin was reflected',
  )
  console.log('ok - Edge Function JWT and CORS boundary')

  const memberEmail = `member-${runId}@omnia.local`
  const memberBody = {
    kind: 'internal',
    email: memberEmail,
    agencyRoleKey: 'contributor',
    departmentKey: 'LUX',
    classification: 'employee',
    idempotencyKey: randomUUID(),
  }
  const memberInvite = await invite(
    apiUrl,
    status.PUBLISHABLE_KEY,
    director,
    memberBody,
    APP_ORIGIN,
  )
  invariant(
    memberInvite.response.status === 201,
    `internal invitation failed (${memberInvite.response.status})`,
  )
  const allowedOrigin = memberInvite.response.headers.get(
    'access-control-allow-origin',
  )
  invariant(
    [APP_ORIGIN, '*'].includes(allowedOrigin),
    `allowed CORS response is invalid (${allowedOrigin ?? 'missing'})`,
  )
  invariant(memberInvite.payload.invitationId, 'internal invitation has no id')
  const replay = await invite(
    apiUrl,
    status.PUBLISHABLE_KEY,
    director,
    memberBody,
    APP_ORIGIN,
  )
  invariant(
    replay.response.status === 200 &&
      replay.payload.replay === true &&
      replay.payload.invitationId === memberInvite.payload.invitationId,
    'invitation replay did not return the original dispatch',
  )
  console.log('ok - invitation dispatch replay is idempotent')

  const member = await acceptInvitation({
    apiUrl,
    publishableKey: status.PUBLISHABLE_KEY,
    mailpitUrl,
    email: memberEmail,
    invitationId: memberInvite.payload.invitationId,
  })
  const { data: memberships, error: membershipError } = await member.client
    .from('agency_memberships')
    .select('agency_id, role_key, status')
    .eq('agency_id', AGENCY_ID)
  invariant(
    !membershipError &&
      memberships?.length === 1 &&
      memberships[0].role_key === 'contributor' &&
      memberships[0].status === 'active',
    'internal membership was not created with the invited authority',
  )
  console.log('ok - internal invitation accepted from Mailpit')

  const restoredMember = browserClient(
    apiUrl,
    status.PUBLISHABLE_KEY,
    member.storage,
  )
  const { data: restoredSession } = await restoredMember.auth.getSession()
  const { data: restoredUser, error: restoredUserError } =
    await restoredMember.auth.getUser()
  invariant(
    restoredSession.session && !restoredUserError && restoredUser.user,
    'session restoration failed',
  )
  const { error: memberLogoutError } = await restoredMember.auth.signOut()
  invariant(!memberLogoutError, 'member logout failed')
  const { data: loggedOut } = await restoredMember.auth.getSession()
  invariant(!loggedOut.session, 'member session remained after logout')
  console.log('ok - session restoration and logout')

  const clientEmail = `client-${runId}@omnia.local`
  const clientInvite = await invite(
    apiUrl,
    status.PUBLISHABLE_KEY,
    director,
    {
      kind: 'client',
      email: clientEmail,
      organizationId: ORGANIZATION_A,
      clientRoleKey: 'client_viewer',
      idempotencyKey: randomUUID(),
    },
    APP_ORIGIN,
  )
  invariant(
    clientInvite.response.status === 201,
    `client invitation failed (${clientInvite.response.status}/${clientInvite.payload.error ?? 'unknown'})`,
  )
  invariant(clientInvite.payload.invitationId, 'client invitation has no id')

  const client = await acceptInvitation({
    apiUrl,
    publishableKey: status.PUBLISHABLE_KEY,
    mailpitUrl,
    email: clientEmail,
    invitationId: clientInvite.payload.invitationId,
  })
  const { data: organizations, error: organizationsError } = await client.client
    .rpc('client_organization_context')
  invariant(
    !organizationsError &&
      organizations?.length === 1 &&
      organizations[0].organization_id === ORGANIZATION_A,
    'client organization isolation failed',
  )
  const { error: clientLogoutError } = await client.client.auth.signOut()
  invariant(!clientLogoutError, 'client logout failed')
  const { error: directorLogoutError } = await director.auth.signOut()
  invariant(!directorLogoutError, 'director logout failed')
  console.log('ok - client A acceptance and Organization B isolation')
  console.log('Auth integration passed without external email delivery.')
}

main().catch((error) => {
  console.error(`Auth integration failed: ${error.message}`)
  process.exitCode = 1
})
