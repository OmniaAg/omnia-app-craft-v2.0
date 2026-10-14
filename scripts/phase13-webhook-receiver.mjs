import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'

// Deterministic developer fixture, never an external credential.
const secret = 'phase13-local-test-signing-material-00000000000000'
const effects = new Set()
const attempts = new Map()
createServer(async (request, response) => {
  if (request.method !== 'POST') { response.writeHead(405); response.end(); return }
  let body = ''
  for await (const chunk of request) { body += chunk; if (body.length > 16384) { response.writeHead(413); response.end(); return } }
  const timestamp = String(request.headers['x-omnia-timestamp'] ?? '')
  const id = String(request.headers['x-omnia-delivery-id'] ?? '')
  const incoming = Buffer.from(String(request.headers['x-omnia-signature'] ?? ''))
  const expected = Buffer.from(`v1=${createHmac('sha256', secret).update(`${timestamp}.${id}.${body}`).digest('hex')}`)
  if (!id || !/^\d+$/.test(timestamp) || Math.abs(Date.now()/1000-Number(timestamp))>300 || incoming.length!==expected.length || !timingSafeEqual(incoming, expected)) {
    response.writeHead(401); response.end(); return
  }
  attempts.set(id, (attempts.get(id) ?? 0)+1)
  if (request.url === '/forbidden') { response.writeHead(403); response.end(); return }
  if (request.url === '/temporary' && attempts.get(id) === 1) { response.writeHead(500); response.end(); return }
  if (!['/hook','/temporary'].includes(request.url)) { response.writeHead(404); response.end(); return }
  const replay = effects.has(id)
  effects.add(id)
  console.log(JSON.stringify({ delivery: id, replay, logicalEffects: effects.size }))
  response.writeHead(200); response.end('ok')
}).listen(56413, '0.0.0.0', () => console.log('Signed local fixture receiver on port 56413'))
