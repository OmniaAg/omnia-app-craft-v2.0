import {createHash} from 'node:crypto'
import {readdirSync,readFileSync} from 'node:fs'
export function sourceFingerprint(){
 const hash=createHash('sha256'),files=[]
 const walk=path=>{for(const item of readdirSync(path,{withFileTypes:true})){const file=path+'/'+item.name;if(item.isDirectory())walk(file);else if(/\.(tsx?|css|sql)$/.test(item.name))files.push(file)}}
 for(const folder of ['src','supabase/migrations','supabase/functions'])walk(folder)
 for(const file of files.sort())hash.update(file).update('\0').update(readFileSync(file)).update('\0')
 return {sha256:hash.digest('hex'),files:files.length}
}
