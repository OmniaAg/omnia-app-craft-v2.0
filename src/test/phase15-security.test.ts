/// <reference types="node" />
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrationKey, limitedJson, openSecret, sealSecret, validateEndpoint } from '../../supabase/functions/_shared/phase13-security'
import { parsePublicEnv } from '../shared/config/env'
import { edgeAllowedOrigins } from '../../supabase/functions/_shared/edge-origins'
beforeEach(()=>vi.stubGlobal('crypto',webcrypto))
afterEach(()=>vi.unstubAllGlobals())
describe('Phase 15 security corrections',()=>{
  it('bounds the duration of an unfinished untrusted body stream',async()=>{
    const cancel=vi.fn()
    const request=new Request('https://example.test',{method:'POST',body:new ReadableStream({cancel}),duplex:'half'} as RequestInit)
    await expect(limitedJson(request,1024,5)).rejects.toMatchObject({code:'request_timeout',status:408})
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('production Edge CORS cannot inherit local origins or wildcard configuration',()=>{
    expect([...edgeAllowedOrigins('*,https://app.example,http://localhost:53170,https://app.example/path','https://project.supabase.co')]).toEqual(['https://app.example'])
    expect(edgeAllowedOrigins(undefined,'http://kong:8000').has('http://localhost:53170')).toBe(true)
  })
  it('allows only an operator-configured full webhook URL',async()=>{
    const resolve=vi.fn(async()=>['8.8.8.8'])
    const options={origins:['https://trusted.example'],allowLocalHttp:false,trustedEndpoints:['https://trusted.example/omnia'],resolve}
    for(const endpoint of ['https://trusted.example/other','https://trusted.example/omnia?redirect=http://localhost','https://trusted.example/%2e%2e/private','https://user:pass@trusted.example/omnia','https://2130706433/omnia','https://[::ffff:127.0.0.1]/omnia'])await expect(validateEndpoint(endpoint,options)).rejects.toMatchObject({code:'endpoint_forbidden'})
    expect(resolve).not.toHaveBeenCalled()
    expect((await validateEndpoint('https://trusted.example/omnia',options)).href).toBe('https://trusted.example/omnia')
    await expect(validateEndpoint('https://trusted.example/omnia',{...options,resolve:async()=>['127.0.0.1']})).rejects.toThrow()
    await expect(validateEndpoint('https://trusted.example/omnia',{...options,trustedEndpoints:undefined})).rejects.toThrow()
  })
  it('rotates encrypted credentials without losing old reads and fails closed on missing keys',async()=>{
    const keyring=JSON.stringify({'1':Buffer.alloc(32,7).toString('base64'),'2':Buffer.alloc(32,8).toString('base64')})
    const old=await integrationKey({keyring,activeVersion:'1'})
    const envelope=await sealSecret('fixture secret only','connection-a',old.key,old.version)
    const current=await integrationKey({keyring,activeVersion:'2'})
    const reader=await integrationKey({keyring,activeVersion:'2'},envelope.key_version)
    const rotated=await sealSecret(await openSecret(envelope,'connection-a',reader.key),'connection-a',current.key,current.version)
    expect(rotated.key_version).toBe('2')
    expect(await openSecret(rotated,'connection-a',current.key)).toBe('fixture secret only')
    await expect(openSecret({...rotated,key_version:'1'},'connection-a',current.key)).rejects.toThrow()
    await expect(openSecret(rotated,'connection-b',current.key)).rejects.toThrow()
    await expect(integrationKey({keyring:JSON.stringify({'2':Buffer.alloc(32,8).toString('base64')})},'1')).rejects.toMatchObject({code:'configuration_missing'})
    await expect(integrationKey({keyring:'invalid'})).rejects.toMatchObject({code:'configuration_missing'})
  })
  it.each(['VITE_INTEGRATION_ENCRYPTION_KEY','VITE_WEBHOOK_SIGNING_SECRET','VITE_AI_PROVIDER_KEY','VITE_PUSH_WORKER_TOKEN'])('rejects frontend secret %s',key=>{
    expect(()=>parsePublicEnv({VITE_APP_URL:'http://localhost:53170',VITE_SUPABASE_URL:'http://localhost:56321',VITE_SUPABASE_PUBLISHABLE_KEY:'public',[key]:'private'})).toThrow(/secret privilegiado/)
  })
})
