import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { securityHeaders } from './scripts/security-headers.mjs'
import { assertPublicKey } from './src/shared/config/public-key.ts'

// https://vite.dev/config/
export default defineConfig(({mode}) => {
 const env=loadEnv(mode,process.cwd(),'VITE_')
 for(const [name,value] of Object.entries(env)) {
  if(value && /SECRET|PRIVATE|SERVICE_ROLE|WORKER_TOKEN|ENCRYPTION|SIGNING|PROVIDER_KEY/i.test(name)) throw new Error(`Privileged frontend configuration: ${name}`)
 }
 for(const name of ['VITE_SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_ANON_KEY'])if(env[name])assertPublicKey(env[name])
 return {
  plugins: [react()],
  build: {manifest:true},
  server: {
    port: 53170,
    strictPort: true,
  },
  preview: {headers:securityHeaders(env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:56321',env.VITE_APP_URL ?? 'http://localhost:53170')},
 }
})
