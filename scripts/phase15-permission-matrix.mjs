import { readFileSync,readdirSync,writeFileSync } from 'node:fs'
const inventory=JSON.parse(readFileSync('artifacts/phase-15/database-inventory-after.json','utf8'))
const testFiles=readdirSync('supabase/tests/database').filter(name=>name.endsWith('.sql'))
const tests=testFiles.map(file=>({file,contents:readFileSync(`supabase/tests/database/${file}`,'utf8')}))
const matrix=inventory.functions.map(fn=>({function:`${fn.schema}.${fn.proname}`,arguments:fn.arguments,definer:fn.prosecdef,searchPath:fn.proconfig,
 anon:fn.anon_execute,authenticated:fn.authenticated_execute,service:fn.service_execute,
 directAuth:/auth\.(?:uid|jwt)\(|request\.jwt\.claim/.test(fn.definition),delegates:[...new Set(fn.definition.match(/(?:public|app_private)\.[a-z_]+(?=\()/g)??[])],
 dynamicSQL:/\bexecute\s+(?:format\(|[a-z_]+\s*;|')/i.test(fn.definition),tests:tests.filter(test=>test.contents.includes(fn.proname)).map(test=>test.file)}))
writeFileSync('artifacts/phase-15/permission-matrix.json',JSON.stringify({note:'Catalog/SQL/test references. A test-file reference is not proof of every argument combination; adversarial runtime evidence is separate.',functions:matrix,tables:inventory.tables,policies:inventory.policies},null,2))
console.log(`Mapped ${matrix.length} functions, ${inventory.tables.length} relations and ${inventory.policies.length} policies; dynamic SQL candidates=${matrix.filter(fn=>fn.dynamicSQL).length}.`)
