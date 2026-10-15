# OMNIA Craft — Estado actual

Actualizado: 2026-10-15 (America/Mexico_City). Verificado contra el repositorio y Supabase local.

## Refactorización UX verificada localmente

PASS local: 45 entradas del router, 97 componentes funcionales y 465 controles revisados. [Informe final](artifacts/ux-refactor/FINAL_REPORT.md), [matriz y pruebas](artifacts/ux-refactor/COVERAGE_MATRIX.md). Developer mantiene paridad con Dirección y los permisos cliente se conservan. READY_FOR_RELEASE_PREPARATION: debe regenerarse el paquete Phase 17; no se ha desplegado ni generado ese paquete nuevo.

## Estado de las fases

| Fase | Estado | Evidencia / siguiente paso |
|---|---|---|
| Phases 0–14 | Implementadas; historial preservado | Base de Phase 14: `e912123` (`feat: complete phase 14 pwa push mobile ux`) |
| Phase 15 — Security Hardening & Performance | **PASS**, cambios locales sin commit | [Completion Report](artifacts/phase-15/COMPLETION_REPORT.md), [gates consolidados](artifacts/phase-15/completion-verification.json) |
| Final Visual & Responsive Quality Pass | **PASS**, validación local final | [Reporte](artifacts/final-visual-qa/FINAL_VISUAL_QA_REPORT.md), [matriz](artifacts/final-visual-qa/visual-matrix.md), [Anti Slop Delivery Gate](artifacts/final-visual-qa/ANTI_SLOP_DELIVERY_GATE.md) |
| Phase 16 | Eliminada deliberadamente | No existe migración legacy necesaria |
| Phase 17 — Production Release & Operations | Pendiente; **READY para iniciar** | [Prerequisitos y handoff](artifacts/phase-15/PRODUCTION_HANDOFF.md); no ejecutada |

## Funcionalidad existente

Auth y capabilities; Organizations/Brands/CRM; Projects/Work/My Space/Dashboard; Editorial; Files privados; Deliverables/Reviews/Approvals; Client Portal real; Messaging/Notifications; Billing; Analytics/Reports; Automations/Integrations/AI foundation; PWA/Web Push. Los módulos anteriormente descritos aquí como mocks o pendientes ya tienen implementación y suites de regresión.

## Revisión visual final

Login corregido y medido: en 375 × 667 el documento pasó de 1006 a 667 px y el botón termina en 565.2 px; en 1366 × 768 pasó de 841 a 768 px. Se permite scroll accesible con poca altura y zoom, sin ocultar controles.

685 mediciones finales de layout, diez tamaños solicitados más landscape, Director/PM/Contributor/Client, 56 checks de flujos y 44 mediciones de formularios. Cero desbordamientos globales estables, controles recortados o errores inesperados de consola/red en la pasada final. Zoom real al 200%, reduced motion, safe area y standalone simulado incluidos. Se corrigieron tablas Billing, mínimos intrínsecos Work/CRM/Analytics, legibilidad Reviews/Messages, foco, navegación por teclado y el enlace Portal a proyectos nulos. El contador de notificaciones está en la navegación y ya no cubre el composer.

Typecheck/lint/102 tests/build pasan. Regresiones Auth, Work, Deliverables, Files, Messages, Billing y Push pasan; PWA final: 28 checks. pgTAP: 796 assertions en DB temporal aislada, sin resetear la fuente. Portal pasó tras preparar su fixture y restaurar exactamente la membership previa. Los fallos iniciales por datos acumulados permanecen documentados en el reporte.

READY para preparar Phase 17, sin ejecutarla ni autorizar despliegue. Siguen pendientes los ensayos físicos de teclado, Safari/iOS/Android standalone y entrega Push real. No hubo commit, deployment, nuevas dependencias, migraciones, cambios de RLS ni lógica financiera. Los procesos locales de preview y Edge Functions de prueba quedaron disponibles para revisión.

Se conserva React/Vite/TypeScript/TanStack Query y Supabase local con Auth, RLS, RPCs, Storage privado, Realtime, audit/domain events y outbox. La autoridad de acceso continúa en el servidor. IA mantiene su proveedor determinístico local y aprobación humana; no se añadió un LLM externo.

## Cambios verificados en Phase 15

- Billing: corregidos bypass de emisión/publicación por escrituras directas, scope de Project y grants sobrevivientes a suspensión. ACL por columna, validación de relaciones, autorización antes de replay/estado, importes exactos e idempotencia con locks. Nueva migración `20261014052637_phase_15_security_performance.sql`; migraciones anteriores preservadas.
- Auth: un evento diferido no restaura la identidad tras logout; limpiar cache y canales antes de cambiar de actor. Restauración inicial verificada sin consultas duplicadas.
- Edge: origins exactos por entorno, cuerpos JSON limitados en bytes/tiempo, destinos webhook completos configurados por operador y keyring AES-GCM versionado. Rotación local real e idempotente verificada.
- Frontend: protección de variables públicas, headers de preview y paginación Billing de 25 filas. Corregida validación de GUID de asignaciones Work que impedía enviar formularios con IDs válidos de seed.
- Rendimiento: índice medido de orden Billing, 1,710.278 → 28.490 ms con 2,000 facturas sintéticas bajo RLS (98.33%). Precache 115 → 38 recursos públicos. Menos requests iniciales en las seis rutas perfiladas.
- Dependencias: dos paquetes transitivos con severidad HIGH actualizados dentro de sus rangos; audit root y manifiesto Edge final con cero vulnerabilidades reportadas.

## Verificación ejecutada

| Gate | Resultado |
|---|---|
| db:start/reset/test/lint/types/types:check | PASS |
| pgTAP | **796/796** (34 nuevas assertions de seguridad) |
| Supabase advisors locales | **0 warnings / 0 errors**, antes 15 warnings |
| Typecheck / lint / build | PASS; lint **0 warnings / 0 errors** |
| Unit tests | **102/102** |
| Regresiones funcionales | **15/15** |
| Seguridad Auth/PostgREST/RPC/Edge | **127 checks** |
| Concurrencia real multi-sesión | **12 checks** |
| PWA / Push determinístico | **28 / 14 checks** |
| Navegador 1440 / 768 / 390 / 375 | **117 checks + 11 flujos por rol** |
| Restore y rotación local | PASS; alcance y límites en el reporte |
| Secret scan / auditoría dependencias | PASS |

Los logs conservan los intentos iniciales fallidos y las verificaciones finales. Los reintentos de Edge/Realtime resolvieron problemas del runtime/CDC local; no se eliminaron tests. [Inventario de superficies](artifacts/phase-15/SECURITY_INVENTORY.md) y [matriz SQL](artifacts/phase-15/permission-matrix.json).

## Pendientes reales para producción

Phase 15 permite **iniciar Phase 17**. El lanzamiento requiere completar sus prerrequisitos:

- Supabase Cloud/staging, secrets separados, HTTPS/CSP/HSTS, workers y monitoreo.
- Egress seguro y validación de la conexión frente a DNS rebinding antes de habilitar webhooks externos; `fetch` no fija IP.
- Owners, MFA/step-up y política de sesiones. Un access JWT emitido puede sobrevivir al logout hasta expiry; membership/capabilities se revalidan en DB.
- Backup/PITR y ensayo de restore Cloud con bytes de Storage y bootstrap Realtime; el restore local cubre DB/Auth/metadata/ACL/RLS.
- Web Push en iOS/Android/desktop reales, VAPID real, permisos y entrega por proveedor.
- Release/rollback y aprobación de lanzamiento. La entrega webhook permanece at-least-once y requiere deduplicación del receptor.

Main JS: **534.537 kB** minificado (**155.101 kB gzip**); supera el objetivo preferido de 500 kB y cumple el budget documentado de 550 kB. Incluye el núcleo React/router/Supabase; rutas operativas siguen lazy. Las mediciones de LCP/CLS son de laboratorio local; Automations registró una long task de 306 ms. RUM/INP y capacidad Cloud deben medirse en Phase 17.

## Ejecución local

Ver [README](README.md#phase-15--local-security-and-performance-gate). En PowerShell usar `npm.cmd` si la política bloquea `npm.ps1`. Ejecutar suites que mutan DB secuencialmente. El reporte contiene los comandos y rutas de evidencia.

No hubo commit, deployment ni conexión a Supabase Cloud. No se ejecutó Phase 17. El Action Plan permanece intacto.

Nota histórica de la entrega Phase 15: Docker estaba detenido y sus resultados backend eran los de las ejecuciones guardadas. La revisión visual posterior volvió a ejecutar las regresiones locales descritas arriba. El escaneo final offline de Phase 15 conserva su resultado previo separado del escaneo completo con status Supabase.
