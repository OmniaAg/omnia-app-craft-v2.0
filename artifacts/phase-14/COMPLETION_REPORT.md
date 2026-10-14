# Phase 14 Completion Report

Fecha: 13 de octubre de 2026. Alcance: OMNIA Craft local; sin commit ni despliegue.

## 1. PWA architecture

- Manifest con identidad OMNIA, `start_url=/`, `scope=/`, `display=standalone` y colores existentes.
- PNG 192/512, maskable 512, apple-touch 180 y badge 96 derivados del isotipo mediante `npm run pwa:icons`.
- Service Worker nativo registrado únicamente en build de producción; scope del propio origen `/`.
- Chromium `Page.getInstallabilityErrors`: cero errores. Manifest, dimensiones, URLs de iconos y control real del SW comprobados.
- Instalación opcional. Actualizaciones esperan acción y confirmación; install fallido conserva el shell anterior. Limpieza limitada a caches propios.

## 2. Cache / Offline strategy

- Allowlist de 115 recursos estáticos del build, con hashes SHA-256 verificados al instalar.
- Shell HTML genérico precacheado; navegación network-first. Nunca se persiste HTML devuelto por navegación.
- REST, Auth, Storage, Realtime, Functions, descargas privadas, orígenes externos y solicitudes no allowlisted usan red.
- Banner accesible offline/degraded; rechazo inmediato de requests/mutations sin red, sin pausa ni cola de mutaciones.
- Query cache privada sólo en memoria; reconnect usa las invalidaciones/refetch existentes.
- Cache Storage inspeccionado tras respuestas privadas y después de autenticar usuarios; sin datos privados ni tokens de runtime.

## 3. Web Push

- Suscripciones privadas por usuario, sesión y dispositivo; usuario derivado del JWT verificado por PostgREST.
- RPCs de registro, baja y status propio; dedupe de endpoint y rechazo de transferencia mientras pertenezca a otro usuario activo.
- Preferencias Phase 10 conservadas, con `push_enabled`; settings en app interna y portal.
- VAPID public key entregada sólo por configuración autenticada; private key, subject y worker token sólo en env del servidor.
- Payload: notification UUID, superficie, UUID aleatorio de generación del dispositivo y hash del endpoint. Display genérico.
- Click construye una ruta interna UUID; Auth conserva ese retorno acotado; RLS carga la notificación y resuelve el recurso autorizado.

## 4. Push delivery

- Trigger sobre `notifications` existentes; `push_delivery_outbox` constituye un canal de entrega y conserva el dominio Phase 10.
- Dispatcher Edge explícito, máximo diez claims por invocación; biblioteca server-side `web-push@3.6.7` fijada.
- Unicidad notification + subscription. `SKIP LOCKED`, lease de 60 segundos y token de fencing.
- Material/finish revalidan sesión, propietario, preferencias, membership, generación y lease.
- Timeout/429/5xx: backoff de 30 segundos hasta una hora, máximo cinco intentos. 404/410: baja y cancelación de pendientes. Otros fallos: terminales.
- La unicidad es lógica. Transporte remoto bajo timeout ambiguo puede ser at-least-once; topic/tag estables reducen display duplicado.

## 5. Session & device safety

- Logout limpia Query cache, Realtime y asociación Push, cierra avisos y da de baja el endpoint del browser.
- Un único UUID aleatorio de revocación vive en IndexedDB del SW; no contiene user ID, JWT, sesión, endpoint, claves ni contenido privado.
- Display y revocación se serializan; logout espera el cierre incluso cuando un push estaba en curso. Web Locks coordina versiones del worker donde existe; fallback serializa el worker activo.
- Se descartan payloads de generaciones anteriores, incluso si un proveedor reutiliza el mismo endpoint.
- B necesita opt-in explícito; sesiones eliminadas invalidan la asociación server-side. Pruebas reales de Auth/RPC y prueba de carrera del SW verificadas.

## 6. Mobile UX

- Menús disclosure accesibles en ambos shells; mismos routes y límites de autorización.
- Safe areas, alturas `dvh`, targets de 44 px y texto de formularios de 16 px en móvil.
- Corregidos desbordamientos reales en Proyectos a 375/390 y acciones del detalle a 768.
- Tablas con scroll local; controles de Archivos/Billing ajustados, formularios Billing con labels visibles.
- Messaging: cambio de canal táctil/teclado, conversación y composer en flujo normal, borrador conservado offline.

## 7. Security

- Sin almacenamiento de respuestas privadas en Cache Storage ni persistencia de Query cache.
- Integridad y URLs de precache controladas por build; sin keys de cache provenientes de datos de usuarios.
- Suscripciones/outbox sin permisos directos de tabla para browser. RPC worker sólo service role.
- Providers HTTPS allowlisted y redirects sin seguimiento; payload y errores no exponen subscription/VAPID secrets.
- Escaneo: 95 archivos del build excluyen private VAPID key, subject y worker token reales del entorno local de prueba.

## 8. PWA / Push tests

- `test:pwa`: **28 checks PASS**, incluyendo update fallido, activación confirmada, offline/reconnect, caches, evento Push, carrera logout/display y notification click.
- `test:push`: **14 checks PASS**, con Auth/RPC/Edge reales y sender local determinista que cifra y firma.
- pgTAP Phase 14: **36 assertions**.
- Browser smoke adicional: **9 checks PASS**, retorno tras login, history/back, aislamiento de A/B, denied/unsupported, borrador offline y envío explícito tras reconnect.
- Se intentó API nativa de suscripción. Este browser de automatización no concede el permiso nativo al worker. Display usa un adapter determinista; eventos Push/SW, IndexedDB, navegación de ventana, DB y dispatcher se ejecutan realmente. No se afirma entrega remota.

## 9. Visual QA

### 1440

**PASS**.

### 768

**PASS**.

### 390

**PASS**.

### 375

**PASS**.

109 comprobaciones por Playwright CLI; cero defectos restantes de la matriz y cero errores de ejecución. Se revisaron screenshots de ambos contextos. Teclado, foco visible, labels, anuncios y reduced motion comprobados. Modo instalado mediante fixture de feature detection; no equivale a instalación real en un sistema operativo. La matriz nativa iOS/Android y el foco desde un click OS real quedan para validación manual de plataforma.

## 10. Verification

| Gate | Resultado |
|---|---|
| db:start / db:reset | PASS, local |
| db:test | **762/762**, 14 archivos |
| db:lint | PASS, cero errores |
| db:types / db:types:check | PASS |
| Local advisors | Cero ERROR; 15 WARN heredados de performance RLS en Billing |
| Regresiones | **15/15 PASS**, secuenciales con reset entre suites |
| typecheck / lint | PASS; 9 warnings de variables/imports no usados heredados |
| Unit tests | **90/90**, 17 archivos |
| build / preview | PASS, build real servido por Vite preview en localhost |
| PWA / Push integration | **28 / 14 PASS** |
| Playwright CLI | **109 + 9 checks PASS** |
| Secret scan / diff check | PASS |

Regresiones: Connectivity, Auth, CRM, Work, Dashboard, Editorial, Deliverables, Files, Portal, Messaging, Billing, Analytics, Automations, Integrations y AI. Connectivity se repitió después de corregir detección de `navigator.onLine` ausente en Node; el intento anterior queda registrado en el JSON.

Evidencia reproducible: `completion-verification.json`, `verification.json`, `frontend-final.json`, `regressions.json`, `pwa-integration.json`, `push-integration.json`, `browser-qa.json`, `browser-smoke.json`, logs y screenshots de esta carpeta.

## 11. Performance / bundle

| Recurso | Antes | Después |
|---|---:|---:|
| Main JS | 527,244 bytes | 534,909 bytes |
| Main JS gzip (misma medición Node) | 152,841 | 155,351 |
| Service Worker | — | 19,062; gzip 9,217 |
| DeviceSettings + SettingsScreen | — | 3,351; gzip 1,573 |

Main: +7,665 bytes, aproximadamente 1.45%. Sin dependencia PWA/frontend nueva. `web-push@3.6.7` sólo en Edge. En QA hubo una lectura de preferences y dos configuration/register/unregister, correspondientes a dos opt-ins y bajas explícitos; ninguna asociación o permission request automática. Sin polling Push de UI.

## 12. Files changed

Inventario exacto de **64 archivos de código/configuración/assets** con su propósito: `files-changed.json`. Agrupación de revisión:

| Archivos | Propósito |
|---|---|
| index.html, public/manifest.webmanifest, public/icons/*.png | Metadata instalable y marca existente |
| scripts/build-pwa.mjs, generate-pwa-icons.mjs | Build estático con integridad e iconos reproducibles |
| src/features/pwa/* | SW, lifecycle, conectividad, settings, revocación y destinos seguros |
| AuthProvider, authorization, LoginScreen, client, AppProviders | Seguridad de sesión/retorno y rechazo offline |
| Shells, FoundationShell, app/portal/messaging CSS | Navegación, safe areas, viewport y Messaging |
| Projects/CRM, Files, Billing | Correcciones móviles verificadas y labels |
| Migración Phase 14 y database.types.ts | Modelo privado, RPCs, outbox y tipos generados |
| supabase/functions/push-api/*, _shared/push-security.ts, config/env example | Dispatcher Web Push y secretos server-only |
| pgTAP, pwa.test.ts, scripts/test/qa/verify/prepare Phase 14 | Gates e integración reproducibles |
| README.md y artifacts/phase-14/* | Runbook, evidencia y limitaciones explícitas |

## 13. Issues / risks discovered

- Browser nativo de automatización: permiso/subscripción/display no disponibles de forma fiable; click sintético no puede dar foco OS. Se usa el fallback determinista permitido en el prompt; no se declara entrega real ni instalación iOS/Android.
- Transporte Web Push no garantiza exactly-once físico frente a timeout ambiguo; DB dedupe/topic/tag proporcionan unicidad lógica y reducción de duplicados.
- **Phase 15:** 15 warnings existentes de políticas RLS permisivas múltiples en `billing_document_files`, `billing_document_items` y `payment_schedules`; warning de main chunk >500 kB y 9 warnings lint heredados. No se hizo remediation global.

## 14. Scope confirmation

Sin cola/mutaciones offline, sin hardening global Phase 15, sin deployment, sin cambios en Supabase Cloud, sin login/link/db push/db pull y sin commit. Action Plan conservado.

## 15. Phase 14 final status

**PASS**, dentro del alcance local y con las limitaciones nativas/remotas documentadas conforme a los puntos 46–47 del prompt.

## 16. Phase 15 readiness

**READY**. Phase 15 no ejecutada y su prompt no generado.
