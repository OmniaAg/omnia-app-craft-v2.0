import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const cli = resolve('node_modules', 'supabase', 'dist', 'supabase.js')

function localUrl(value, expectedPort, label) {
  const url = new URL(value)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`${label} must use a loopback host`)
  }
  if (expectedPort && url.port !== expectedPort) {
    throw new Error(`${label} uses an unexpected port`)
  }
  return url
}

export function getLocalSupabaseStatus() {
  const status = JSON.parse(
    execFileSync(process.execPath, [cli, 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )

  localUrl(status.API_URL, '56321', 'Supabase API')
  if (!status.PUBLISHABLE_KEY) {
    throw new Error('Local Supabase publishable key is unavailable')
  }
  return status
}

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

export async function waitForPostgrest(
  status = getLocalSupabaseStatus(),
  { timeoutMs = 8_000, requestTimeoutMs = 1_500 } = {},
) {
  const endpoint = new URL('/rest/v1/rpc/health_check', status.API_URL)
  const deadline = Date.now() + timeoutMs
  let backoffMs = 100
  let attempt = 0
  let lastFailure = 'PostgREST did not respond'

  while (Date.now() < deadline) {
    attempt += 1
    const controller = new AbortController()
    const requestTimeout = setTimeout(() => controller.abort(), requestTimeoutMs)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: status.PUBLISHABLE_KEY,
          'content-type': 'application/json',
        },
        body: '{}',
        signal: controller.signal,
      })
      const body = await response.text()
      if (response.ok) {
        const payload = JSON.parse(body)
        if (payload?.status !== 'ok') {
          throw new Error('PostgREST health_check returned an invalid payload')
        }
        return { status, attempts: attempt }
      }

      lastFailure = `HTTP ${response.status}: ${body.slice(0, 240)}`
      const transientSchemaMiss =
        response.status === 404 &&
        (body.includes('PGRST202') || body.includes('health_check'))
      if (![502, 503, 504].includes(response.status) && !transientSchemaMiss) {
        throw new Error(`PostgREST readiness failed without retry: ${lastFailure}`)
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('PostgREST health_check returned malformed JSON', {
          cause: error,
        })
      }
      if (
        error instanceof Error &&
        error.message.startsWith('PostgREST readiness failed without retry:')
      ) {
        throw error
      }
      lastFailure = error instanceof Error ? error.message : String(error)
    } finally {
      clearTimeout(requestTimeout)
    }

    if (Date.now() + backoffMs >= deadline) break
    await delay(backoffMs)
    backoffMs = Math.min(750, Math.ceil(backoffMs * 1.6))
  }

  throw new Error(
    `PostgREST was not ready within ${timeoutMs}ms after ${attempt} attempts: ${lastFailure}`,
  )
}

