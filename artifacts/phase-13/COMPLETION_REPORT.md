# Phase 13 Completion Report

## 1. Architecture

Implementado exclusivamente Phase 13, local-first, con Project como scope ejecutable.
Organization y Agency se derivan del Project. Se reutilizan capabilities, memberships,
domain/audit events y el comando authoritative de Work. Runs funcionan como outbox
de automatización; deliveries son su ledger externo, sin reescribir notification_outbox.
Una nueva Edge Function, `automation-api`, separa comandos de browser y dispatcher privado.

## 2. Automations

Triggers manuales y cinco eventos existentes: work.created, work.completed,
work.status_changed, deliverable.published_to_client y review.changes_requested.
Hasta cinco condiciones AND y cinco acciones ordenadas: crear Work o enviar webhook
a conexión aprobada del mismo Project. Definiciones versionadas y snapshots de runs.
Claim SKIP LOCKED, token de fencing, lease 60 s y revalidación de permisos por paso.
Tres intentos por ciclo, backoff exponencial 5–300 s para timeout/429/5xx y hasta
tres retries manuales. Pasos completados no se repiten; failed conserva historial.
Deduplicación por event/workflow, key/actor y step ID. Auto-origen suprimido,
profundidad máxima 3; replay no aplica una definición habilitada/revisada después del evento.

## 3. AI

Provider abstraction con único provider local_deterministic, modelo omnia-local-v1,
plantillas v1 en código y validación estricta Zod/DB. Casos: resumen de Project y
borrador de Work. Contexto mínimo autorizado: nombre, conteos y hasta 20 títulos;
Contributor sólo recibe trabajo asignado. No se usan archivos, mensajes o Billing.
Entrada 2,000 caracteres, salida 8 KiB, timeout 8 s, 10 solicitudes/min/actor y
dos concurrentes. Historial propio, provenance y usage nullable. Sin tools autónomos
ni proveedor externo. Crear Work requiere revisión, aprobación y autorización
actual en el comando existente, con ejecución idempotente.

## 4. Integrations

Conexiones Project-scoped, único provider generic_webhook outbound. Metadata segura
pública; URL y credenciales cifradas en app_private con AES-256-GCM, nonce aleatorio
y AAD por conexión/versión. Clave y token sólo en environment servidor. Secret input
de sólo escritura, sin variables de secreto en la caché de mutaciones y limpio
tras guardar/cancelar. HTTPS/origen exacto permitido,
DNS público validado, sin redirects, URL credentials/query/fragment, timeout 8 s.
Firma HMAC-SHA256 sobre timestamp.deliveryId.body; payload mínimo v1 y delivery ID
estable para deduplicación externa. Receiver determinista valida firma, ventana de
cinco minutos y replay. Test Connection, disable e historial de entregas implementados.
Inbound a OMNIA, OAuth y sincronización no se implementan: no hay provider/mapping
inbound definido para este alcance.

## 5. Authorization & RLS

Dirección recibe las siete capabilities nuevas dentro de su Agency. PM requiere
grant explícito y membership activa del Project; configurar secretos o consentimiento
de IA permanece restringido a Dirección. Contributor no configura workflows/conexiones
y sólo usa IA con ai.use. Client no accede a superficies o runs internos.
RLS forzada, grants por columnas seguras y comandos authoritative; browser no puede
insertar estados finales, cambiar resultados/actores/usage ni leer credenciales.

## 6. Security

Verificados aislamiento Organization/Project, owner/scope/action/provider forjados,
mutación directa, RPC privado, firmas falsas/expiradas, replay e inyección de prompt.
Secretos ausentes de respuestas, auditoría, eventos, DOM, storage, consola y assets.
La revisión final corrigió contraste de tarjetas y el límite de ciphertext para
secretos Unicode de longitud válida. El runtime Edge actualizado entregó nuevamente
una prueba firmada. CORS local de Kong y Function usa origins exactos.

## 7. Frontend

/app/automations y /app/integrations son rutas lazy con scopes autorizados, formularios
estructurados, estados, paginación de 20 filas, historial, detalles y errores seguros.
/app/projects/:projectId/assistant muestra provenance, consentimiento y aprobación
humana. Verificadas las tres superficies y dos formularios a 1440/768/390, sin overflow;
contraste de tarjetas ≥4.5:1, labels, foco visible y targets de al menos 44 px.
Nueve vistas finales inspeccionadas, además de muestras claras y capturas de formularios.

## 8. E2E / Integration

Automations: 21 checks; Integrations: 29; AI: 20. Auth/RPC/Edge/HTTP reales del stack
local. Incluyen event-trigger, condiciones, dedupe, loop A→B→A, dos workers compitiendo,
leases expirados, conservación de Work en retry, webhook firmado y fallo terminal,
AI scoped/structured y aprobación idempotente. Browser: 48 checks funcionales,
incluyendo PM sin capability y Client bloqueado; cero runtime/console errors,
cero HTTP errors inesperados y cero fugas. Config ausente de Edge: seis checks.

## 9. Verification

| Gate | Resultado final |
|---|---|
| db:start / db:reset | PASS, sólo stack local |
| db:test | 726/726; 13 archivos pgTAP |
| db:lint | PASS |
| db:types / db:types:check | PASS; tipos generados por CLI |
| Advisors | PASS sin errores; 15 WARN anteriores en Billing |
| test:automations / test:integrations / test:ai | 21 / 29 / 20 checks PASS |
| Regresiones | 12/12 PASS: connectivity, Auth, CRM, Work, Dashboard, Editorial, Deliverables, Files, Portal, Messaging, Billing, Analytics |
| Edge | Valid/unauthorized/invalid/config ausente/provider failure verificados; firma real tras último ajuste |
| typecheck / lint / build | PASS; 9 warnings de lint preexistentes |
| Unit/component | 83/83; 16 archivos, 23 casos Phase 13 |
| Dev | Vite localhost:53170 operativo |
| Playwright | 48 checks PASS, 1440/768/390 y revisión visual |
| Worker | Invocación autenticada PASS, cola vacía devuelve processed=false |
| Secret scan / git diff --check | PASS |

Los intentos fallidos iniciales se conservan. Mailpit cerraba conexiones en su puerto
publicado; reiniciar sólo ese servicio permitió Auth completo. Un timeout transitorio
Realtime se repitió satisfactoriamente en DB limpia. El harness ahora cierra sockets
también en fallo. Un timeout del router bajo carga pasó al ejecutar la suite aislada;
los gates frontend finales completos volvieron a pasar. Evidencia actual consolidada
en completion-verification.json, regresiones en regressions-latest.json y frontend
en frontend-final.json.

## 10. Performance / bundle

Cold loads medidos: Automations 3 queries, Integrations 3, AI 5. Sin duplicates
inesperados ni polling de historial; el worker opcional invoca una cola explícita.
Índices por scope/time, definición habilitada/event type, actor/time y claim pendiente.

| Asset | Bytes | Gzip bytes |
|---|---:|---:|
| Main before | 526622 | 152673 |
| Main after | 527244 | 152841 |
| AutomationsScreen | 11253 | 3397 |
| IntegrationsScreen | 6588 | 2439 |
| ProjectAssistantScreen | 5633 | 2295 |
| Shared Phase 13 UI/API/model | 7662 | 3114 |
| Project scope hook | 362 | 270 |

Main crece 622 bytes (0.12%). Gzip medido consistentemente con node:zlib.
Cero dependencias nuevas; package-lock sin cambios y sin SDK de proveedor.

## 11. Files changed

39 archivos fuente, más evidencias bajo artifacts/phase-13.

| Archivo | Propósito |
|---|---|
| README.md | Arquitectura, límites, setup y comandos Phase 13 |
| package.json | Scripts locales, dispatcher y verificaciones |
| scripts/start-local-supabase.mjs | CORS exacto del gateway local al arrancar |
| scripts/reset-local-supabase.mjs | Recuperación limitada del race de Storage y CORS local |
| scripts/test-messaging-integration.mjs | Diagnóstico de suscripción y cleanup en error |
| src/app/router/routes.tsx | Tres rutas lazy nuevas |
| src/app/shells/InternalAppShell.tsx | Navegación por capability |
| src/features/projects/screens/ProjectDetailScreen.tsx | Entrada al asistente Project-scoped |
| src/shared/api/supabase/database.types.ts | Tipos regenerados, no editados manualmente |
| supabase/config.toml | Registro de automation-api y JWT manual validado con Auth |
| scripts/capture-phase13-responsive.js | Vistas responsive, theme samples y query counts |
| scripts/check-phase13-secrets.mjs | Scanner de assets/evidencia sin imprimir secretos |
| scripts/configure-local-functions-cors.mjs | Ajuste acotado del servicio Functions de Kong |
| scripts/phase13-bundle.mjs | Mediciones before/after de chunks |
| scripts/phase13-webhook-receiver.mjs | Receiver HTTP local firmado y determinista |
| scripts/phase13-worker.mjs | Dispatcher autenticado once/watch |
| scripts/prepare-phase13-local.mjs | Environment de fixtures ignorado y passwords locales |
| scripts/qa-phase13-playwright.js | 48 comprobaciones funcionales y de interfaz |
| scripts/run-phase13-browser-qa.mjs | Ejecutar CLI y persistir sólo resultados seguros |
| scripts/test-phase13-edge-config.mjs | Fallos seguros con config incompleta |
| scripts/test-phase13-integration.mjs | Tres suites locales reales/adversariales |
| scripts/verify-phase13.mjs | Gates secuenciales y regresiones aisladas |
| src/features/ai/ProjectAssistantScreen.tsx | Resumen, borrador, consentimiento y aprobación |
| src/features/automations/AutomationForm.tsx | Editor estructurado de triggers/condiciones/acciones |
| src/features/automations/AutomationsScreen.tsx | Gestión, ejecución, historial y retry |
| src/features/automations/api.ts | Queries actor/scope, read models y comandos |
| src/features/automations/automations.css | Tokens del tema, responsive, contraste y touch targets |
| src/features/automations/model.ts | Schemas de lectura y safe error labels |
| src/features/automations/ui.tsx | Scope selector, status, timing y paginación |
| src/features/automations/usePhase13Project.ts | Selección de Project autorizada y URL |
| src/features/integrations/IntegrationsScreen.tsx | Conexiones write-only, health y deliveries |
| src/test/phase13-security.test.ts | Crypto, SSRF, límites y provider/AI adversarial |
| supabase/.env.example | Variables servidor sin valores sensibles |
| supabase/functions/_shared/phase13-ai.ts | Provider abstraction y schemas/output timeout |
| supabase/functions/_shared/phase13-security.ts | AES-GCM, HMAC, endpoint guard y body limits |
| supabase/functions/automation-api/deno.json | Imports existentes fijados para Deno |
| supabase/functions/automation-api/index.ts | API autenticada, dispatcher y proveedores seguros |
| supabase/migrations/20261010034151_phase_13_automations_ai_integrations.sql | Modelo, RLS, grants, eventos, cola y comandos |
| supabase/tests/database/0013_phase_13_automations_ai_integrations.test.sql | pgTAP de trust boundaries y rate limits |

## 12. Issues / risks discovered

- No blockers pendientes para este MVP local. Se corrigieron los problemas de
  contraste y expansión Unicode encontrados durante la verificación.
- Quedan 15 WARN de policies permisivas múltiples en tablas Billing anteriores,
  9 warnings de lint anteriores, warning de main >500 kB y HydrateFallback del router.
  No se amplió el alcance a hardening global.
- Webhook es at least once; receptor debe deduplicar delivery ID. La allowlist
  requiere DNS de confianza: fetch no fija la IP previamente resuelta.
- Clave maestra version=1 sin keyring: cambiarla requiere migración/reconfiguración
  de credenciales de servidor. Rotación del secreto de firma sí está disponible.
- IA es únicamente el provider determinista local, sin un LLM externo configurado.

## 13. Scope confirmation

Sin PWA, Push, service worker de producto, offline, despliegue, Supabase Cloud,
hardening global Phase 15 ni autonomía IA sin control humano. Action Plan no reescrito.
Sin commit. Phase 14 no ejecutada.

## 14. Phase 13 final status

PASS.

## 15. Phase 14 readiness

READY. No se inició Phase 14.
