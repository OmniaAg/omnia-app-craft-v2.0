export function securityHeaders(supabaseUrl,appUrl) {
  const api=new URL(supabaseUrl),app=new URL(appUrl)
  if(!['http:','https:'].includes(api.protocol)||!['http:','https:'].includes(app.protocol)||api.username||api.password)throw new Error('Invalid public origin')
  const websocket=new URL(api.origin);websocket.protocol=api.protocol==='https:'?'wss:':'ws:'
  const policy=["default-src 'self'","base-uri 'self'","object-src 'none'","frame-ancestors 'none'","frame-src 'self' blob:","form-action 'self'","script-src 'self'","style-src-elem 'self'","style-src-attr 'unsafe-inline'","img-src 'self' blob: data:","font-src 'self'","worker-src 'self'",`connect-src 'self' ${api.origin} ${websocket.origin}`,"manifest-src 'self'"]
  const headers={'Content-Security-Policy':policy.join('; '),'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','X-Frame-Options':'DENY','Cache-Control':'no-store'}
  if(app.protocol==='https:')headers['Strict-Transport-Security']='max-age=31536000; includeSubDomains'
  return headers
}
