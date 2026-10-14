# Phase 15 Completion Report

OMNIA Craft · 2026-10-14 · America/Mexico_City · base `e912123` · verificación exclusivamente local.

## 1. Executive Summary

**Phase 15: PASS. Phase 17: READY para iniciar.** Se corrigieron vulnerabilidades reproducibles de Billing y revocación de permisos, una carrera de identidad frontend y fallos de validación. Se endurecieron ACLs, Functions, variables públicas, webhooks y cifrado; se optimizaron consultas, arranque y precache sin debilitar RLS.

No quedó un HIGH/CRITICAL confirmado sin remediar en el alcance local auditado. Esto no acredita configuración Cloud ni entrega Push física: son prerrequisitos explícitos de Phase 17. Todos los gates automáticos aplicables pasaron: 796 pgTAP, 102 unit tests, 15 regresiones, 127 checks HTTP adversariales, 12 de concurrencia real y 117 checks de navegador más 11 flujos por rol.

Evidencia consolidada: [completion-verification.json](completion-verification.json). Inventario de entrada/salida, actores, datos sensibles y fronteras autoritativas: [SECURITY_INVENTORY.md](SECURITY_INVENTORY.md).

## 2. Security Audit

| Area | Findings | Fixes | Final Status |
|---|---|---|---|
| Authentication | Evento Auth diferido podía restaurar UI/identidad después de logout; restore inicial duplicaba consultas | Guard de versión; limpieza antes de verificar otro actor; un único restore inicial | PASS; política JWT/MFA en handoff |
| Authorization | Grants explícitos sobrevivían suspensión; Billing org-scope omitía asignación Project | Membership activa, capability vigente y Project explícito | PASS |
| RLS | Policies Billing ALL/read superpuestas; grants amplios permitían saltar comandos | Policies por operación, ACL por columna, checks de relaciones y FORCE RLS | PASS |
| RPCs | EXECUTE heredado de PUBLIC; autorización posterior a replay/estado | ACL explícita, default privileges seguros, autorización primero, locks de idempotencia | PASS |
| Storage | Assets privados y publicados dependientes de Project; adjuntos Billing insuficientemente relacionados | Scope y capability `file.view` en adjunto; policies/flows existentes preservados | PASS; bytes de backup Cloud pendientes |
| Realtime | Membership revocada con canal aún abierto; CDC local frío generó timeouts de QA | Verificación de evento posterior denegado y cleanup de canales al cambiar actor | PASS |
| Edge Functions | Invite sin cuerpo bounded; CORS local podía heredarse; lectura sin deadline | JSON por bytes/5s; origins exactos según runtime; no-store/nosniff | PASS |
| Automations | Necesidad de probar claim, lease recovery y efectos tardíos realmente concurrentes | Tests multi-sesión, fencing y revalidación del owner existentes preservados | PASS |
| Integrations | DNS check previo sin IP pinning; sólo master key v1 | Endpoints completos fijos de operador; keyring/AAD versionado y rotación local CAS | PASS local; egress MUST antes de externos |
| AI | Contexto, permisos, salida hostil y aprobación humana | Regresiones y controles vigentes preservados; proveedor determinístico local | PASS |
| PWA | Precache de todas las rutas aumentaba descarga inicial | Sólo shell/Auth/error con SHA-256; APIs privadas siempre red | PASS |
| Push | Endpoint compartido, logout/user switch y finish tardío | Pruebas de recipients, generation/session y fencing reales | PASS determinístico; native QA pendiente |
| Frontend | Variables públicas podían aceptar key privilegiada; formulario Work rechazaba GUID seed válido | Guard build/runtime; CSP; GUID canónico y error de asignación visible | PASS |
| Dependencies | 2 paquetes transitivos con severidad agregada HIGH | source-map-js 1.2.2; undici 8.11.2 | PASS, audit 0 root/Edge |

Se inspeccionaron 70 relaciones, 251 funciones finales y 77 policies. Las 236 funciones SECURITY DEFINER tienen search_path vacío. No se identificaron candidatos de SQL dinámico en el catálogo revisado. [Inventario inicial](database-inventory-before.json), [final](database-inventory-after.json), [matriz de permisos y delegación](permission-matrix.json). Una referencia estática a un test no prueba todas las combinaciones posibles de argumentos; las ejecuciones adversariales y las regresiones se documentan aparte.

## 3. RLS / Supabase Advisors

**Inicial: 15 warnings de Billing. Final: 0 warnings / 0 errors.** Se investigaron las policies superpuestas; se sustituyeron por una lectura consolidada y policies INSERT/UPDATE/DELETE diferenciadas en los tres hijos Billing. No se silenció el advisor ni se removió RLS. [Salida final](advisors.log).

La escritura directa de `status`, `number`, publicación y emisor ahora carece de grant; sólo se conservan columnas comerciales de draft. El comando requiere permiso vigente antes de examinar replay/estado. Organization, Brand, Project y Opportunity deben coincidir. Adjunto exige el mismo tenant y el Project del documento cuando existe.

La migración es nueva: [20261014052637_phase_15_security_performance.sql](../../supabase/migrations/20261014052637_phase_15_security_performance.sql). No se alteraron migraciones previas. Se revocó EXECUTE de PUBLIC/anon en cuatro RPCs financieros y helpers heredados; `health_check` es la única función de aplicación invocable por anon. Default privileges impiden que funciones futuras hereden EXECUTE público.

**34 nuevas assertions pgTAP, 796/796 total.** Catálogo RLS/view invoker/search_path, ACL worker/credentials, escalación por columna, scope de Project, cliente publicado/no publicado, capabilities expiradas/suspendidas, replay, importes y adjuntos. [Test SQL](../../supabase/tests/database/0015_phase_15_security.test.sql), [prueba inicial roja](security-red.log), [dedicada final](security-sql-final.log), [suite completa](db-test.log). El red inicial tuvo 19 fallos de 31 assertions; la suite final se amplió a 34, sin eliminar protección para obtener PASS.

La combinación grants/RLS se mantuvo como frontera de datos, conforme al modelo de [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 4. Vulnerability Remediation

**P15-001**

- **Severity:** HIGH.
- **Affected component:** tablas/RPC Billing y publicación cliente.
- **Evidence:** un actor con acceso a draft podía escribir lifecycle/number/publication directamente; el cliente veía el documento indebidamente publicado. `security-red.log`; catálogo before.
- **Root cause:** grants de tabla permitían columnas administradas por comandos; RLS de fila no restringía el cambio de lifecycle.
- **Correction:** grants por columna, policies de draft, publicación/emisión sólo mediante RPC autorizado, FORCE RLS.
- **Verification:** 34 pgTAP de seguridad, HTTP directo y regresión Billing PASS.
- **Residual risk:** las credenciales administrativas/backend siguen siendo privilegiadas y deben separarse en producción.

**P15-002**

- **Severity:** HIGH.
- **Affected component:** `has_capability`, Billing scope y relaciones.
- **Evidence:** capability org-scoped habilitaba Project no asignado; grant explícito persistía con agency membership suspendida; asociación Project/org inconsistente aceptada.
- **Root cause:** capability se evaluaba sin membership activa y sin imponer simultáneamente el scope del recurso.
- **Correction:** membership activa + capability vigente + Project asignado; verificación Organization/Brand/Project/Opportunity y adjuntos.
- **Verification:** pgTAP y actores de dos agencies/organizations/proyectos en `security-http.json`.
- **Residual risk:** cambios de roster legítimos deben administrarse por los comandos autorizados.

**P15-003**

- **Severity:** MEDIUM.
- **Affected component:** comandos financieros, ACL de funciones e idempotencia.
- **Evidence:** cliente o actor revocado obtenía errores de estado antes de `forbidden`; EXECUTE público en catálogo; key nula/replay podían llegar al estado prematuramente.
- **Root cause:** autorización posterior a lookup/replay y privilegio EXECUTE por defecto. El EXECUTE de anon por sí solo no demostró una escritura anónima: otros guards seguían presentes.
- **Correction:** autorización primero; ACL explícita; key obligatoria y lock actor/capability/key; conflicto de replay verificado.
- **Verification:** SQL de revocación/ACL/replay y dos sesiones independientes que reciben un único ID/evento/número.
- **Residual risk:** mantener el patrón en RPCs futuros y los permisos service-only de workers.

**P15-004**

- **Severity:** MEDIUM.
- **Affected component:** `AuthProvider` y datos/canales del actor anterior.
- **Evidence:** test de evento Auth encolado tras logout; cambio de identidad con cache previa pendiente.
- **Root cause:** el timer no comparaba la versión de la operación antes de restaurar identidad.
- **Correction:** guard de versión y limpieza de cache/Realtime antes de verificar un actor diferente.
- **Verification:** unit tests dedicados y logout/user switch PWA/Push PASS.
- **Residual risk:** el access JWT ya emitido conserva su expiry; decidir MFA/session policy en Phase 17. La corrección de UI no promete invalidación instantánea de todos los JWT.

**P15-005**

- **Severity:** MEDIUM.
- **Affected component:** entradas monetarias y Functions.
- **Evidence:** precisión sub-cent/non-finite manejada de forma inconsistente; Invite no limitaba cuerpo; streams sin deadline de lectura.
- **Root cause:** validación incompleta antes de cálculo/persistencia y parseo JSON sin presupuesto completo.
- **Correction:** importe finito, positivo y exacto a centavos; JSON por bytes y deadline de 5 segundos, errores sanitizados.
- **Verification:** SQL de NULL/NaN/precision y pruebas unitarias/HTTP de cuerpos grandes y timeout.
- **Residual risk:** cuotas globales y protección volumétrica del host se configuran antes del tráfico de producción.

**P15-006**

- **Severity:** HIGH según npm audit, exposición transitive de tooling.
- **Affected component:** source-map-js 1.2.1 y undici 8.10.0.
- **Evidence:** `dependency-audit-before.json` sobre el lockfile original; advisory de source maps y grupo de advisories undici.
- **Root cause:** versiones transitivas vulnerables en jsdom/Vite/tooling.
- **Correction:** actualización dentro de los rangos actuales a 1.2.2 y 8.11.2; sin upgrades masivos.
- **Verification:** npm ci limpio, build/unit PASS, audit root y Edge aislado con 0 vulnerabilidades.
- **Residual risk:** un audit limpio describe los advisories publicados al ejecutarlo, no garantiza ausencia de fallos desconocidos.

Endurecimientos adicionales sin evidencia de exfiltración previa: keyring/rotación AES-GCM, bloqueo de secrets bajo VITE, endpoints webhook fijos, headers, menor precache. El problema GUID Work fue un bug funcional demostrado red/green, no una vulnerabilidad de autorización. No se afirma haber explotado DNS rebinding sobre infraestructura Cloud.

## 5. Multi-Tenant Isolation

| Frontera / actor | Evidencia verificada |
|---|---|
| Agency | Director/PM de A/B no leen ni mutan tenant ajeno; role/capability autoescalation denegada |
| Organization | Grants de Organization limitados a su agency y recurso; Billing relaciones consistentes |
| Brand | Brand vinculado a Organization/Project; no asociación cruzada de documento |
| Project | Capability amplia no concede Project no asignado; miembros/reviewers explícitos |
| Director | Comandos autorizados funcionan; no se añadió permiso de self-membership ni self-review |
| PM | Project asignado permite Work/review submit; sin capability no administra automatizaciones |
| Contributor | No crea finanzas ni administra IA; conserva sólo scope asignado |
| Client | Sólo publicación/Project permitido; aprobación exige reviewer explícito; Project privado y documentos draft denegados |
| Revocation/expiration | Capability expirada, membership suspendida y replay posterior denegados; canal Realtime abierto recibe cero eventos nuevos tras revocación |
| Direct RPC | Auth/PostgREST reales, sin depender de botones ocultos; worker claims y credentials privados denegados |

[HTTP: 127 checks / 8 actores](security-http.json), [SQL adversarial](security-sql-final.log), [Realtime revocado](messaging-revocation-final.log), [navegador por rol](browser-workflows.json). Las regresiones cubren CRM/Work/Files/Portal/Billing y los demás módulos. La matriz documenta grants/policies reales, no una promesa de cobertura exhaustiva de cada argumento de cada RPC.

## 6. Integrations / AI / Automations

Webhooks requieren origin permitido **y URL completa en `WEBHOOK_TRUSTED_ENDPOINTS`** configurada por operador. HTTPS en entorno externo; HTTP exige ambos flags de test y runtime local. Se conservan DNS/private-address checks, redirect manual, HMAC, timestamp, delivery ID, retries bounded y permiso del owner revalidado antes de uso.

`fetch` no fija IP; persiste una ventana DNS TOCTOU si se habilita un destino externo sin egress apropiado. Antes de hacerlo en producción se exige proxy/egress que bloquee metadata/redes privadas y valide la conexión real. Las conexiones deben permanecer deshabilitadas mientras falte ese control. La allowlist fija elimina destinos libres; no se presenta como IP pinning.

Secrets en schema privado, write-only para usuario. AES-GCM con nonce aleatorio y AAD `connection + key_version`; reader usa la key del envelope. Keyring versionado permite escribir con key nueva y leer antiguos. La prueba local migró un envelope v1→v2 mediante transacción/CAS, preservó plaintext sin imprimirlo y una segunda rotación actualizó cero filas. Old reader conservado para rollback. [key-rotation.json](key-rotation.json). El helper es loopback-only; rotación Cloud pertenece a Phase 17.

Concurrencia real: único automation claim; lease expirado obtiene otro token; worker tardío no finaliza ni duplica Work; Push finish tardío es no-op y no sobrescribe el claim nuevo. Dos pagos concurrentes de 60 sobre deuda 100 admiten uno y dejan exactamente 60; dos issue con la misma key reciben un mismo ID con un número/evento. [12 checks](concurrency.json).

IA continúa determinística/local, contexto mínimo y output validado, sin tools ni credenciales externas. Permiso/consentimiento/scope y aprobación humana se verifican en servidor. [Automations 21](automations-integration.json), [Integrations 29](integrations-integration.json), [AI 20](ai-integration.json). La entrega webhook sigue **at-least-once**: el receptor debe deduplicar; no se promete exactly-once de red.

## 7. PWA / Push

Precache SHA-256: 38 recursos estáticos de shell/Auth/error; no datos privados ni user/session tokens. Auth/REST/Storage/Functions/Realtime/downloads permanecen fuera de Cache Storage, incluido offline. Las rutas operativas opcionales requieren red. Updates incompletos conservan el worker activo; el usuario controla activación.

Device binding/generation opaca separa usuarios; logout limpia binding/notices; Push en vuelo de A no se muestra después de bind B incluso con endpoint idéntico. Recipients persistidos y auth.sessions revalidados; endpoints propios, payload genérico con IDs seguros y deep links internos. Carrera de endpoint compartido deja un único owner; outbox tiene lease/fencing/retry bounded.

VAPID y signing/encryption sólo server-side, sin secretos en bundle. [PWA 28](pwa-integration.json), [Push 14](push-integration.json), [concurrencia](concurrency.json). CDP/SW y envío cifrado/firmado local son reales; display/provider son fixtures determinísticas explícitas. Permisos OS, subscribe/display/focus y entrega real en iOS/Android/desktop siguen como QA MUST de Phase 17.

## 8. Database Performance

| Query / Area | Before | After | Improvement |
|---|---:|---:|---|
| Billing: 25 filas, 2,000 invoices, mismo RLS/dataset | 1,710.278 ms; Seq Scan + top-N sort | 28.490 ms; Index Scan + Limit | **98.33%**, evita evaluar/ordenar 2,000 filas para la primera página |
| Shared hit blocks Billing | 50,721 | 1,304 | 97.43% menos en este ensayo |
| Advisors policies Billing | 15 warnings | 0 | Una policy de lectura por hijo; operaciones diferenciadas |
| Projects (seed local) | 6.579 ms | 6.657 ms | Sin mejora atribuible; variación de laboratorio |
| Work (seed local) | 8.425 ms | 9.786 ms | Sin mejora atribuible; no se ocultó el costo |
| Automation history (seed local) | 6.467 ms | 5.528 ms | Variación de laboratorio; sin nuevo índice |

[EXPLAIN ANALYZE BUFFERS sintético](billing-load.json) y [planes before](sql-before.json)/[after](sql-after.json) de nueve áreas. Índice nuevo `billing_documents_created_id_idx(created_at DESC,id DESC)`; el ensayo usa un índice candidato equivalente y rollback del dataset. El índice tiene costo de espacio/INSERT/UPDATE: justificado por el listado ordenado real; no se añadieron índices especulativos.

Los snapshots seed before/after no tienen idéntica cantidad de datos de QA (por ejemplo Billing 0.140→7.326 ms), por lo que no se usan para afirmar aceleración general. Ninguna consulta final de ese seed superó 10 ms. El ensayo Billing controlado sí usa la misma cardinalidad/predicado, RLS activo y 25 filas.

No se identificó una cadena frontend de consultas por cada fila de Billing: la lista usa una consulta paginada de 26 filas (25+lookahead), orden estable y key de actor. No se deshabilitó RLS ni se añadió bypass por performance. Se eliminó restore Auth duplicado: una verificación inicial y una carga de perfil/memberships/capabilities, reduciendo requests en todas las rutas perfiladas.

## 9. Frontend Performance

| Asset / Metric | Before | After | Delta |
|---|---:|---:|---:|
| Main JS minificado | 534.909 kB | 534.537 kB | −0.372 kB |
| Main gzip medido | 155.351 kB | 155.101 kB | −0.250 kB |
| Total JS de todas las rutas | 1,030.965 kB | 1,032.437 kB | +1.472 kB por guards/errores/paginación |
| Mayor chunk opcional: DashboardGrid | 74.066 kB | 74.066 kB | 0; sigue lazy |
| Schemas compartidos | 70.333 kB | 70.333 kB | Ya no son dependencia eager del bootstrap env |
| Recursos precache | 115 | 38 | −77 (66.96%) |
| Precache público final | — | 1,196,379 bytes | Dentro del budget 1.25 MB |
| Requests `/app` | 47 | 42 | −5 |
| Requests `/app/projects` | 44 | 37 | −7 |
| Requests `/app/messages` | 37 | 31 | −6 |
| Requests `/app/analytics` | 41 | 36 | −5 |
| Requests `/app/automations` | 44 | 37 | −7 |
| Requests `/portal` | 40 | 33 | −7 |

| Route | LCP before → after (ms) | CLS final |
|---|---:|---:|
| `/app` | 640 → 484 | 0.0193 |
| `/app/projects` | 824 → 480 | 0.0135 |
| `/app/messages` | 388 → 392 | 0.00035 |
| `/app/analytics` | 552 → 348 | 0.0079 |
| `/app/automations` | 588 → 248 | 0.0248 |
| `/portal` | 680 → 168 | 0.0229 |

[Bundles](bundle-after.json), [baseline](bundle-before.json), [routes before](routes-before.json)/[after](routes-after.json), [budgets PASS](performance-budgets.json). Mediciones de Chromium/local preview; no p95 Cloud, RUM ni INP. Cache/resource transfer puede variar entre muestras. Automations registró una long task de **306 ms**; necesita medición de interacción con uso real.

Main sigue sobre el preferido de 500 kB. Se conserva un budget explícito de 550 kB para el núcleo React DOM/router/Supabase; no se fragmentó artificialmente para esconder el warning de Vite. Screens/forms/Widgets siguen lazy; env usa validación URL nativa y la schema de invitación se carga sólo al ejecutar ese comando. Se documenta la limitación, sin prometer un ahorro grande de bytes.

Headers de preview: CSP self scripts, sin unsafe-eval, frame-ancestors none/nosniff; `frame-src self blob:` permite el preview privado sandboxed existente. Únicamente style-src-attr permite inline por el grid, según [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr); styles de elementos siguen self. HSTS se emite sólo con APP_URL HTTPS. [Compatibilidad de iframe](headers-preview.json). La política se configuró mediante [Vite preview.headers](https://vite.dev/config/preview-options); el hosting real debe reproducirla.

## 10. Dependency Audit

Inicial: **2 paquetes vulnerables**, ambos HIGH en el resumen npm audit. source-map-js advisory de source-map offsets; undici agrupa varios advisories de distinta severidad. Rutas transitivas son tooling jsdom/Vite; no se presenta cada advisory como un exploit demostrado del navegador de OMNIA.

Fixes: `source-map-js 1.2.1 → 1.2.2`, `undici 8.10.0 → 8.11.2`. Sin cambios masivos de versiones/arquitectura. `npm ci` limpio y lockfile consistente: [clean-install.log](clean-install.log). Inicial: [dependency-audit-before.json](dependency-audit-before.json). Final root **0**: [dependency-audit.json](dependency-audit.json); imports npm fijados de Edge **0** en manifiesto aislado: [edge-dependency-audit.json](edge-dependency-audit.json).

No vulnerabilidades reportadas pendientes de aceptación. La cobertura del audit Edge aplica a esos imports npm; no sustituye mantener actualizado el runtime Supabase/Deno ni su configuración Cloud.

## 11. Verification

```text
db:start: PASS
db:reset: PASS
db:test: PASS
pgTAP count: 796/796 (34 nuevas assertions)
db:lint: PASS
db:types: PASS
db:types:check: PASS
advisors: PASS — 0 warnings / 0 errors

typecheck: PASS
lint: PASS — 0 warnings / 0 errors
unit tests: PASS — 102/102
build: PASS — main 534.537 kB, warning >500 documentado

security integration: PASS — 127 checks HTTP / 8 actores
concurrency: PASS — 12 checks multi-sesión reales
all regressions: PASS — 15/15

Playwright 1440: PASS
Playwright 768: PASS
Playwright 390: PASS
Playwright 375: PASS
117 checks responsive/PWA/Push + 11 flujos reales por rol

production preview: PASS — artefacto Vite local, CSP/iframe/MIME/headers verificados
secret scan: PASS — 0 hallazgos; build/source/evidence y 10 valores backend verificados sin imprimirlos
```

Evidencias generadas:

- Backend: [backend-gates.json](backend-gates.json), `db-start.log`, `db-reset.log`, `db-test.log`, `db-lint.log`, `db-types.log`, `db-types-check.log`, `advisors.log`.
- Frontend: [frontend-gates.json](frontend-gates.json), `typecheck.log`, `lint-final.log`, `test.log`, `build.log`, `work-form-red.log`, `work-form-green.log`, `work-form-build.log`.
- Seguridad: [security-gates.json](security-gates.json), [security-http.json](security-http.json), `security-http-final.log`, `security-sql-final.log`, `security-unit.log`, `security-concurrency-retry.log`, [concurrency.json](concurrency.json), [secret-scan.json](secret-scan.json).
- Regresiones: [regressions-gates.json](regressions-gates.json) y logs `test-*.log`; `test-automations-retry.log`, `test-integrations-retry.log`, `test-ai-retry.log`, `messaging-revocation-final.log`.
- Navegador: [browser-responsive.json](browser-responsive.json), [browser-workflows.json](browser-workflows.json), [headers-preview.json](headers-preview.json), PNGs reales `app-*` / `portal-*` a los cuatro anchos.
- Rendimiento/backup/cifrado: [performance-budgets.json](performance-budgets.json), [billing-load.json](billing-load.json), [restore.json](restore.json), `restore-final.log`, [key-rotation.json](key-rotation.json).
- [Consolidado y checks de consistencia](completion-verification.json).

Al entregar este reporte Docker estaba detenido. Los gates backend y el scan completo con 10 valores corresponden a las ejecuciones registradas; no se declara un rerun backend en este momento. El cierre de archivos se verificó además con [secret-scan-offline.json](secret-scan-offline.json): source/build/evidence, 8 valores de env local y patrones de JWT/service-role, cero hallazgos; ese modo no consulta las dos keys de status Supabase y no reemplaza el resultado completo anterior. [visual-completion.json](visual-completion.json) confirma ocho widgets cargados a cada ancho y screenshots finales sin overflow/errores; su harness suplementario corrigió el selector de logout y la apertura del menú móvil.

Los gates conservan `previousAttempt` cuando el runtime Edge local dejó de servir durante hot reload/reset y se reintentó con runtime preparado. Realtime requirió readiness real del slot/CDC local; el resultado final confirma recepción permitida y bloqueo tras revocación. No se sustituyeron por mocks ni se borraron intentos fallidos. La suite unit final se ejecutó aislada de otras instancias Vitest para evitar tiempos de transform cold del host Windows compartido.

## 12. Remaining Risks

| Risk | Severity | Production Blocker | Mitigation |
|---|---|---|---|
| DNS TOCTOU sin IP pinning de fetch | HIGH condicional | Sí, antes de habilitar webhooks externos | URL fija del operador + egress/proxy que verifique conexión y bloquee IP privada/metadata; mantener conexiones deshabilitadas hasta validarlo |
| Configuración Cloud/HTTPS/secret manager/workers no ejecutada | Prerrequisito operativo | Sí | Staging separado, dry-run migration, ACL/RLS/headers/worker scheduling y smoke |
| Native Push/VAPID/provider real sin QA física | MEDIUM | Sí para liberar Push | Matriz iOS/Android/desktop, logout/switch, permisos, retry/410/TTL/deep links |
| Restore Cloud/PITR y bytes físicos de Storage no probados | HIGH operativo | Sí | Backups DB+objetos, RPO/RTO, bootstrap Realtime, ensayo staging; restore local ya PASS |
| Access JWT puede sobrevivir logout hasta expiry local 3600s | MEDIUM, decisión de operación | Sí, política debe quedar aprobada | Definir sesión/MFA/step-up; DB revalida memberships/grants y Push auth.sessions |
| Entrega webhook at-least-once | INFORMATIONAL, semántica explícita | Receptor debe aceptarla | Deduplicar delivery_id/idempotency-key; alertar agotamiento de retries |
| Main >500 kB, long task Automations 306 ms | LOW, rendimiento | No con budgets actuales | Main ≤550 kB, rutas lazy; medir INP/RUM/cardinalidad real y optimizar según evidencia |
| Límites globales de tráfico/capacidad Cloud sin load test | MEDIUM operativo | Sí antes de tráfico público | Cuotas del host/rate limits por actor/tenant, monitoreo y sizing staging; no confundir lab con SLA |

Restore local real: dump mantenido en memoria, scratch DB aislada creada/eliminada con nombre fijo; 4 Projects, 10 users, 32 audit events y 2 documentos Billing preservados, RLS/ACL intactos. 1,264,005 bytes; sin secretos escritos al disco. Schemas internos Realtime requieren bootstrap de plataforma; Storage bytes no se incluyeron. [restore.json](restore.json).

## 13. Phase 17 Handoff

**MUST complete before production**, en orden:

1. **Production deployment prerequisites:** owners, roster, MFA/session policy, aceptación manual por rol, local/staging/prod separados; excluir seeds y transportes determinísticos de QA.
2. **Production secrets:** APP_URL/allowed origins exactos; public publishable key; worker tokens separados; VAPID; keyring versionado y retirada de claves antiguas sólo después de verificar todos los envelopes. Nada privado bajo VITE.
3. **Supabase Cloud:** crear/linkear en Phase 17, dry-run/apply controlado, tipos/advisors/RLS y regresiones staging; deploy versionado de Functions.
4. **Network controls:** HTTPS y headers del host; bloquear egress privado/metadata y verificar rebinding sobre conexión real antes de activar externos.
5. **Monitoring:** health/outbox/leases/retries, redacción de payload/token, alertas y responsable de incidentes; scheduling seguro de workers.
6. **Backups:** DB/PITR + bytes Storage, retención/RPO/RTO y restore staging con ACL/RLS/Auth/Realtime bootstrap y smoke por rol.
7. **Release/rollback:** artefactos versionados, SW update/rollback, forward-fix/restore, canary/health y aprobación humana de lanzamiento.
8. **Native device QA:** Push real en iOS/Android/desktop; permissions, install, foreground/background, deep links, logout/user switch y proveedor real.

**Recommended after launch:** RUM LCP/INP/CLS y p95 RPC con redacción; tuning de índices/cardinalidad/connections; revisiones periódicas de acceso/retención/keys; SBOM/audit recurrente. Los requisitos de egress/backup/session/Push no se relegan a esta lista.

Runbook completo: [PRODUCTION_HANDOFF.md](PRODUCTION_HANDOFF.md). Ningún paso de operación Cloud fue ejecutado en Phase 15.

## 14. Files Changed

La lista exacta de paths y su propósito está en [files-changed.json](files-changed.json). Los logs y snapshots de Phase 15 documentan resultados, fallos iniciales y reintentos. Las evidencias históricas de Phase 14 se conservaron en su versión original; los resultados nuevos viven en Phase 15.

| File | Purpose | Security/performance impact |
|---|---|---|
| [.gitignore](../../.gitignore) | Exclude disposable rotation env | Avoid committing server credentials |
| [OMNIA_CRAFT_STATUS.md](../../OMNIA_CRAFT_STATUS.md) | Replace stale Phase 5 status with verified Phase 15 status | Visible production prerequisites |
| [README.md](../../README.md) | Local reproducible gates and production boundaries | Operator runbook |
| [package-lock.json](../../package-lock.json) | Fix vulnerable source-map-js and undici within existing ranges | Remove reported vulnerable versions |
| [package.json](../../package.json) | Expose Phase 15 audit/security/performance/restore commands | Reproducible verification |
| [scripts/audit-phase15.mjs](../../scripts/audit-phase15.mjs) | Catalog/database/bundle inventory before/after | Concrete audit and asset evidence |
| [scripts/build-pwa.mjs](../../scripts/build-pwa.mjs) | Precache bootstrap/Auth/error dependency graph only | 38 static resources; private APIs excluded |
| [scripts/check-phase15-secrets.mjs](../../scripts/check-phase15-secrets.mjs) | Value-aware source/build/evidence secret scan | Detect leakage without printing credentials |
| [scripts/diagnose-phase15-realtime.mjs](../../scripts/diagnose-phase15-realtime.mjs) | Diagnose/warm actual local subscription and replication slot | Address cold CDC readiness without mocked events |
| [scripts/phase15-completion-evidence.mjs](../../scripts/phase15-completion-evidence.mjs) | Validate all recorded gates and counts before report | Prevent unsupported completion claims |
| [scripts/phase15-permission-matrix.mjs](../../scripts/phase15-permission-matrix.mjs) | Catalog actual functions/grants/policies/delegates | Authorization audit traceability |
| [scripts/prepare-phase13-local.mjs](../../scripts/prepare-phase13-local.mjs) | Configure explicit local trusted webhook endpoint | Deterministic tests satisfy stricter endpoint policy |
| [scripts/profile-billing-load.mjs](../../scripts/profile-billing-load.mjs) | Controlled rollback dataset and EXPLAIN index comparison | Measure RLS-active 2000-row list |
| [scripts/profile-phase15.mjs](../../scripts/profile-phase15.mjs) | Nine SQL plans and six production-route profiles | Evidence and lab performance budgets |
| [scripts/retry-phase15-regressions.mjs](../../scripts/retry-phase15-regressions.mjs) | Supervise local runtime and preserve failed attempt metadata | Sequential verifiable retries after watcher instability |
| [scripts/retry-phase15-security.mjs](../../scripts/retry-phase15-security.mjs) | Supervise local runtime and preserve failed attempt metadata | Sequential verifiable retries after watcher instability |
| [scripts/rotate-integration-keys-local.mjs](../../scripts/rotate-integration-keys-local.mjs) | Local-only transactional CAS re-encryption | Versioned credential rotation without printing plaintext |
| [scripts/run-phase15-browser-qa.mjs](../../scripts/run-phase15-browser-qa.mjs) | Responsive QA plus real cross-role workflows | Production artifacts and scope checks |
| [scripts/security-headers.d.mts](../../scripts/security-headers.d.mts) | Shared CSP/MIME/frame/referrer/permissions/HSTS policy and types | Production preview enforcement |
| [scripts/security-headers.mjs](../../scripts/security-headers.mjs) | Shared CSP/MIME/frame/referrer/permissions/HSTS policy and types | Production preview enforcement |
| [scripts/test-billing-integration.mjs](../../scripts/test-billing-integration.mjs) | Assert both concurrent valid payments and replay identity | Stronger transaction regression |
| [scripts/test-concurrency-phase15.mjs](../../scripts/test-concurrency-phase15.mjs) | Real independent session races and late worker tests | Prove locks/leases/fencing |
| [scripts/test-dashboard-integration.mjs](../../scripts/test-dashboard-integration.mjs) | Remove unused import | Zero lint warnings |
| [scripts/test-deliverables-integration.mjs](../../scripts/test-deliverables-integration.mjs) | Remove unused query binding | Zero lint warnings |
| [scripts/test-editorial-integration.mjs](../../scripts/test-editorial-integration.mjs) | Remove unused query binding | Zero lint warnings |
| [scripts/test-files-integration.mjs](../../scripts/test-files-integration.mjs) | Remove unused query binding | Zero lint warnings |
| [scripts/test-fixtures/credentials.mjs](../../scripts/test-fixtures/credentials.mjs) | Remove unused query binding | Zero lint warnings |
| [scripts/test-key-rotation-local.mjs](../../scripts/test-key-rotation-local.mjs) | Actual local version transition and idempotent rerun | Prove keyring/old reader rollback compatibility |
| [scripts/test-messaging-integration.mjs](../../scripts/test-messaging-integration.mjs) | Revoke member on a still-open subscription then emit new event | Prove no post-revocation Realtime delivery |
| [scripts/test-phase13-edge-config.mjs](../../scripts/test-phase13-edge-config.mjs) | Provide trusted endpoint fixture | Preserve strict webhook policy in QA |
| [scripts/test-phase15-headers.mjs](../../scripts/test-phase15-headers.mjs) | Sandboxed blob iframe compatibility test | Preserve private preview under CSP |
| [scripts/test-phase15-security.mjs](../../scripts/test-phase15-security.mjs) | Run local gates sequentially with captured exit codes/logs | Reproducible full verification |
| [scripts/test-restore-local.mjs](../../scripts/test-restore-local.mjs) | Isolated scratch local dump/restore in memory | Verify data/RLS/ACL without writing secrets |
| [scripts/test-security-integration.mjs](../../scripts/test-security-integration.mjs) | Direct Auth/PostgREST/RPC/Edge adversarial checks | 127 checks across eight actors |
| [scripts/verify-phase15.mjs](../../scripts/verify-phase15.mjs) | Run local gates sequentially with captured exit codes/logs | Reproducible full verification |
| [scripts/warm-local-realtime.mjs](../../scripts/warm-local-realtime.mjs) | Diagnose/warm actual local subscription and replication slot | Address cold CDC readiness without mocked events |
| [scripts/write-phase15-migration.mjs](../../scripts/write-phase15-migration.mjs) | Generate one new migration from audited baseline definitions | Preserve older migration history |
| [src/features/auth/api/auth-service.ts](../../src/features/auth/api/auth-service.ts) | Load invitation schema only for invitation command | Avoid eager schema request on bootstrap |
| [src/features/auth/context/AuthProvider.tsx](../../src/features/auth/context/AuthProvider.tsx) | Guard deferred Auth events and clear old actor before verification | Prevent stale identity/cache after logout or switch |
| [src/features/billing/api.ts](../../src/features/billing/api.ts) | Stable 25-row actor-scoped query with lookahead | Bound response size and preserve RLS |
| [src/features/billing/screens/BillingScreen.tsx](../../src/features/billing/screens/BillingScreen.tsx) | Pagination, pending/error feedback | Bound existing financial list |
| [src/features/work/model/schemas.ts](../../src/features/work/model/schemas.ts) | Accept canonical GUIDs used by actual DB/seed | Fix form rejection; server authorization preserved |
| [src/features/work/ui/WorkForms.tsx](../../src/features/work/ui/WorkForms.tsx) | Show nested assignee validation error | Prevent silent submit failure |
| [src/shared/config/env.ts](../../src/shared/config/env.ts) | Validate public config and privileged variable names | Prevent server-only keys under public config |
| [src/shared/config/public-key.ts](../../src/shared/config/public-key.ts) | Reject secret keys and non-anon JWT public key values | Shared build/runtime validation |
| [src/styles/app.css](../../src/styles/app.css) | Wrap navigation and accessible pagination buttons | Responsive usability |
| [src/test/auth-provider.test.tsx](../../src/test/auth-provider.test.tsx) | Meaningful regression/security tests | Evidence for actual vulnerabilities and Work form failure |
| [src/test/env.test.ts](../../src/test/env.test.ts) | Meaningful regression/security tests | Evidence for actual vulnerabilities and Work form failure |
| [src/test/phase13-security.test.ts](../../src/test/phase13-security.test.ts) | Meaningful regression/security tests | Evidence for actual vulnerabilities and Work form failure |
| [src/test/phase15-security.test.ts](../../src/test/phase15-security.test.ts) | Meaningful regression/security tests | Evidence for actual vulnerabilities and Work form failure |
| [src/test/setup.ts](../../src/test/setup.ts) | Allow bounded lazy transform wait in Testing Library | Reliable asynchronous tests |
| [src/test/work-form.test.tsx](../../src/test/work-form.test.tsx) | Meaningful regression/security tests | Evidence for actual vulnerabilities and Work form failure |
| [supabase/functions/_shared/edge-origins.ts](../../supabase/functions/_shared/edge-origins.ts) | Exact environment-aware CORS origins | No inherited localhost allowance in Cloud |
| [supabase/functions/_shared/phase13-security.ts](../../supabase/functions/_shared/phase13-security.ts) | Bound JSON time/bytes, fixed webhook endpoints, versioned keyring | Edge/network/cryptographic hardening |
| [supabase/functions/automation-api/index.ts](../../supabase/functions/automation-api/index.ts) | Use environment origins and versioned encryption reader/writer | Correct secret version and CORS enforcement |
| [supabase/functions/invite-user/index.ts](../../supabase/functions/invite-user/index.ts) | Bound JSON and exact origins; no-store/nosniff | Protect privileged invite endpoint |
| [supabase/functions/push-api/index.ts](../../supabase/functions/push-api/index.ts) | Reuse exact environment-aware origins | Push endpoint CORS boundary |
| [supabase/migrations/20261014052637_phase_15_security_performance.sql](../../supabase/migrations/20261014052637_phase_15_security_performance.sql) | New additive Billing/ACL/active-membership/key envelope/index migration | Security correctness and measured SQL performance |
| [supabase/tests/database/0015_phase_15_security.test.sql](../../supabase/tests/database/0015_phase_15_security.test.sql) | 34 adversarial/catalog pgTAP assertions | Prove RLS/ACL/scope/replay integrity |
| [vite.config.ts](../../vite.config.ts) | Production manifest, public env guard and preview headers | CSP/security boundary and asset inspection |
| [vitest.config.ts](../../vitest.config.ts) | Bound workers on shared Windows host | Stable test execution without removing tests |
| [artifacts/phase-15](.) | Actual JSON gates, plans, audits, reports and PNG evidence | Security/performance verification with explicit local limits |

## 15. Scope Confirmation

```text
No new business features.
No Phase 17 implementation.
No Supabase Cloud connection.
No production deployment.
No destructive rearchitecture.
```

No commit. Action Plan intacto. Migraciones anteriores intactas. Roles/capabilities, tenant boundaries, outbox, human approval, provider local de IA, semántica webhook y arquitectura PWA/Push preservados. GUID Work y paginación Billing corrigen/limitan flujos existentes; no añaden módulos comerciales.

## 16. Phase 15 Final Status

**PASS.** Gates aplicables ejecutados y evidencia local consolidada sin fallos finales. Vulnerabilidades confirmadas remediadas. Pendientes operativos/manuales explícitos en las secciones 12–13.

## 17. Phase 17 Readiness

**READY para iniciar Phase 17 — Production Release & Operations.** El código endurecido y sus verificaciones permiten empezar configuración staging/Cloud, release y QA manual. El despliegue público requiere completar la lista MUST; este reporte no declara producción desplegada ni una aprobación humana simulada.
