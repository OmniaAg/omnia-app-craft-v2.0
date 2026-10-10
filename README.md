# OMNIA Craft 2.0

Foundation local de Identity, Auth & Authorization, CRM, operación de proyectos, dashboard personalizable, planificación editorial, entregables, archivos privados, Client Portal, mensajería y notificaciones de OMNIA Craft.

No incluye publicación real a redes sociales ni configuración remota.

## Requisitos

- Node.js `>=24.15.0`
- npm `>=11.0.0`
- Docker Desktop en ejecución

Supabase CLI `2.115.0` está fijada como dev dependency. npm es el único package manager autorizado y `package-lock.json` es el único lockfile.

## Instalación

```bash
npm install
```

Crea el environment local del frontend:

```powershell
Copy-Item .env.example .env.local
```

Inicia Supabase, ejecuta `npm run db:status` y copia únicamente `publishableKey` a `VITE_SUPABASE_PUBLISHABLE_KEY`. El wrapper oculta las claves server que la CLI imprime por defecto. Nunca copies secret/service-role/JWT ni credenciales DB a variables `VITE_*`.

```env
VITE_APP_URL=http://localhost:53170
VITE_SUPABASE_URL=http://127.0.0.1:56321
VITE_SUPABASE_PUBLISHABLE_KEY=<LOCAL_PUBLISHABLE_KEY>
```

El parser admite `VITE_SUPABASE_ANON_KEY` sólo como fallback legacy y exige exactamente una clave pública. `.env.local` y `supabase/.env.local` están ignorados por Git.

## Arranque local

Terminal 1 — servicios y base reproducible:

```bash
npm run db:start
npm run db:reset
```

Terminal 2 — Function de invitaciones con recarga local:

```bash
npm run functions:serve
```

Terminal 3 — frontend:

```bash
npm run dev
```

Abre `http://localhost:53170`. Vite usa `strictPort = true`: si el puerto está ocupado, falla explícitamente y nunca cambia de URL. No se detienen procesos ajenos.

Mailpit está disponible en `http://127.0.0.1:56324`; recuperación e invitaciones se entregan únicamente ahí. No se configura SMTP productivo ni se envían emails externos.

## Servicios y puertos

- `project_id`: `omnia-craft`

| Servicio | Puerto |
|---|---:|
| Shadow DB | `56320` |
| API gateway | `56321` |
| PostgreSQL | `56322` |
| Studio | `56323` |
| Mailpit | `56324` |
| Analytics, si se habilita | `56327` |
| Edge inspector | `56328` |
| Pooler, si se habilita | `56329` |

Analytics y pooler permanecen deshabilitados. El flujo local no requiere ni permite `supabase login`, `supabase link`, push, pull o acceso a un proyecto remoto.

## Identidad y autoridad

- `profiles` contiene sólo datos presentacionales; roles, memberships y capabilities nunca viven en metadata editable.
- `agency_memberships` y `client_memberships` son las fuentes operativas de autoridad por contexto.
- `founder` es una clasificación organizacional, no un rol ni un bypass.
- Los roles del servidor se mapean a capabilities; los grants explícitos conservan agency/organization scope y pueden expirar o revocarse.
- `has_capability()` es la comprobación central del servidor. `my_capabilities()` sólo proyecta hints de UX; manipular React o una ruta no concede datos.
- Un PM no recibe CRM global por rol. Los fixtures conceden a `pm.scoped@omnia.local` capabilities separadas y scope exclusivo para Organization A; `pm.basic@omnia.local` permanece sin CRM.
- Los clientes no leen tablas internas de Organizations, Opportunities, pipeline o CRM Activities. `client_organization_context()` y `client_brand_context()` devuelven únicamente columnas públicas explícitas.
- La membership de Organization no concede acceso a Projects. PMs, contributors y clients requieren `project_memberships` activas; los clients reciben únicamente `client_project_context()` y nunca Work Items, comentarios, eventos ni assignees.
- RLS está habilitado y forzado. Los catálogos y eventos son server-managed; no hay escrituras genéricas desde el browser.
- Invitaciones, aceptación y mutaciones sensibles usan comandos transaccionales, idempotencia y domain/audit events. La Edge Function valida sesión, origen, contrato y scope antes de usar credenciales server-side.

## Bootstrap y fixtures locales

`supabase/seed.sql` crea fixtures deterministas para pruebas:

- una Directora OMNIA;
- PM sin grants y PM con capabilities CRM sólo para Organization A;
- contributor clasificado como founder para probar que la clasificación no eleva privilegios;
- client admin/reviewer/viewer en Organization A y viewer en Organization B;
- seis departamentos, Organization A con Brand A1/Brand A2 y Organization B con Brand B1;
- Projects A1/A2/A3/B1, PM A/B, contributors A/B y client members explícitos para probar aislamiento cruzado;
- milestones, Work Items asignados, comentarios y pendientes personales que cubren overdue/today/upcoming/no due date.

Los usuarios seeded tienen la contraseña determinista `OmniaTest!2026` configurada después de `db:reset`. `npm run test:auth` verifica login y aislamiento de roles. El primer director existe por un bootstrap administrativo explícito del seed; ningún signup trigger concede membresía o rol. El bootstrap productivo se definirá en la fase de deployment, no aquí.

### Local Test Accounts

**TEST ONLY — NEVER USE IN PRODUCTION**

| Role | Email | Password | Scope |
| ---- | ----- | -------- | ----- |
| Agency Director | director@omnia.local | OmniaTest!2026 | Full agency access |
| Project Manager | pm.scoped@omnia.local | OmniaTest!2026 | Assigned projects |
| Contributor | contributor@omnia.local | OmniaTest!2026 | Assigned tasks |
| Client Admin | client.admin.a@omnia.local | OmniaTest!2026 | Org A invitations |
| Client Reviewer | client.reviewer.a@omnia.local | OmniaTest!2026 | Org A approvals |
| Client Viewer | client.viewer.a@omnia.local | OmniaTest!2026 | Org A view only |
| Cross-Client | client.user.b@omnia.local | OmniaTest!2026 | Org B view only |


## Auth local

React implementa:

- login y logout;
- restauración de sesión verificada con `getUser()`;
- recuperación y cambio de contraseña;
- aceptación de invitación ligada al email autenticado;
- estado forbidden;
- resolución aislada de `/app` y `/portal`;
- proyección de capabilities sólo como UX.

Las screens no consultan Supabase directamente. `AuthProvider` y el servicio de Auth coordinan el cliente tipado; PostgreSQL/RLS sigue siendo la autoridad.

## CRM interno

- `/app/crm/accounts` — Organizations paginadas, búsqueda, lifecycle y creación.
- `/app/crm/accounts/:organizationId` — Overview, Brands, Contacts, Opportunities y Activity.
- `/app/crm/contacts` — listado paginado y alta dentro de scope autorizado.
- `/app/crm/opportunities` — listado paginado, creación y cambio de etapa server-side.

Las rutas CRM se cargan de forma lazy. Las screens componen query options y mutations de la feature; no llaman `supabase.from()` directamente.

## Projects, Work y My Space

- `/app/projects` — proyectos autorizados con contexto Organization/Brand, búsqueda, estado y paginación.
- `/app/projects/:projectId` — overview, miembros, milestones y lista de Work Items; el detalle de trabajo incluye asignación, transiciones válidas, comentarios e historial contextual.
- `/app/my-space` — lectura agregada de trabajo asignado y pendientes personales, ordenada por overdue, today, upcoming y sin fecha.

`work_items` es el núcleo canónico del trabajo de Project. Soporta múltiples assignees internos activos, estados `todo/in_progress/blocked/done/cancelled`, prioridad simple y deadlines como instantes UTC mostrados y capturados en `America/Mexico_City`. Las fechas de Project y milestone son `date` y no se convierten artificialmente a medianoche UTC.

La creación puede dejar un Work Item sin assignees como backlog explícito. Una reasignación posterior exige al menos un miembro interno activo para evitar que una edición accidental retire toda la responsabilidad; sólo PM/Director autorizado ejecuta ese comando.

Los pendientes personales viven en `personal_work_items`: la tabla separada hace explícito que un pendiente privado no es Project work, no admite assignees ni `project_id`, y mantiene RLS self-owned más pequeña. My Space los unifica sólo en su read model seguro.

Crear, asignar, transicionar, comentar y archivar trabajo pasa por RPCs transaccionales. React no encadena escrituras directas; invalida caches de proyecto, trabajo o My Space de forma dirigida. Work no usa Realtime ni polling.

## Dashboard personalizable

- `/app` carga de forma lazy el dashboard real con defaults en código y hasta 12 widgets.
- `WidgetRegistry` versiona ocho widgets sobre My Space, Projects, CRM y accesos operativos; la base no almacena componentes, consultas ni definiciones ejecutables.
- La personalización permite añadir, quitar, ordenar, mover y redimensionar. React Grid Layout v2 se usa sólo en desktop/tablet; mobile conserva una columna y controles accesibles alternativos al gesto.
- `dashboard_user_configs` guarda un override self-owned. `save_dashboard_config()` aplica allowlist, schema estricto, tamaños, breakpoints, no-overlap, capabilities y límite de instancias antes de un compare-and-swap por `revision`.
- `reset_dashboard_config()` elimina el override y recupera inmediatamente los defaults capability-aware del código.
- Work y Projects comparten `dashboard_operational_summary()`; los widgets CRM comparten `dashboard_crm_summary()`. Un actor sin capabilities CRM no monta esos widgets ni ejecuta esa consulta.
- La carga inicial hace 2 roundtrips para contributor (config + resumen operativo) y 3 para un actor con CRM (añade resumen CRM). No hay N+1 por widget.

Los scripts de arranque, reset e integración esperan de forma acotada a que PostgREST publique `health_check`; reintentan sólo fallos transitorios y no convierten errores reales 4xx en esperas silenciosas.

## Editorial

- `/app/editorial/calendar` ofrece agenda accesible y calendario mensual de los Projects autorizados; `/app/projects/:projectId/editorial` fija el scope de un Project. En mobile la agenda tiene prioridad.
- Los ciclos son intervalos `date` con inicio y fin libres. Las semanas son filas visuales derivadas de fechas; no existe tabla de semanas ni límite de cuatro.
- Plantillas de Project guardan sólo defaults de canal, formato e instrucciones. Se pueden crear, editar y archivar. Crear una pieza desde una plantilla crea atómicamente su `work_items` canónico y un único `editorial_items` relacionado por FKs de Project.
- Una pieza guarda fecha editorial `date` y hora local opcional sin convertir fechas puras a UTC. El estado de planificación (`planned`, `available`, `assigned`, `cancelled`) es independiente del estado operativo del Work Item.
- `available` significa que contributors internos, activos y miembros del Project pueden postularse. El PM o Director autorizado ve postulantes y acepta uno mediante RPC transaccional; las otras postulaciones se resuelven y `work_item_assignees` sigue siendo la fuente de asignación. Una asignación manual desde Work también resuelve postulaciones pendientes.
- My Space sigue leyendo el Work Item asignado mediante su read model existente. No hay publicación social, cuentas conectadas, tokens, archivos ni notificaciones en esta fase.
- Calendar/list usa un RPC acotado por ventana visible de hasta 93 días y filtros de Project, estado y canal; la pantalla no carga todo Editorial ni usa Realtime.

## Deliverables y revisión interna

- Un `work_items` canónico admite como máximo un `deliverables`; Editorial llega a la entrega mediante su Work Item, sin tabla paralela.
- Cada envío crea un snapshot inmutable en `deliverable_versions` con número reservado bajo lock en PostgreSQL. Las notas y el conjunto exacto de `deliverable_files` quedan fijados en la misma transacción.
- `review_requirements` guarda reviewers internos concretos por Project y permite reemplazarlos para un Deliverable. El MVP usa personas concretas, lo que simplifica el control de membresía y evita reglas de rol universales. Un cambio de configuración retira requirements anteriores; cada `review_rounds` conserva sus `review_assignments` originales.
- La fixture local concede `review.configure` sólo al PM de Organization A mediante grant explícito; otros PM no reciben ese permiso por rol.
- `record_review_decision` registra una sola decisión `approve` o `request_changes` por assignment. Cualquier solicitud de cambios cierra la ronda y devuelve la entrega a ejecución. Todas las aprobaciones requeridas, u overrides auditados, dejan la entrega `ready_for_client` y el Work Item `done`.
- `override_review_requirement` es exclusivo de una Directora con capability `review.override`; exige razón, conserva reviewer/requisito/version y enlaza `review_overrides` con `audit_events`. No equivale a una aprobación.
- `publish_deliverable_to_client` exige la última versión aprobada internamente, registra su `version_id` exacto y crea una revisión cliente separada. Las tablas de revisión interna permanecen invisibles al cliente.
- `/app/reviews` consulta sólo assignments pendientes del actor. `/app/deliverables/:workItemId` ofrece envío, historial de versiones, decisiones, timeline y override autorizado. `/app/projects/:projectId/reviews` configura los reviewers de Project o Deliverable.
- `npm run test:deliverables` ejecuta el flujo completo y carreras con sesiones reales contra Supabase local. `npm run db:test` incluye pgTAP de schema, RLS, snapshots, transitions, idempotencia e inmutabilidad.

## Archivos privados y Content Manager

- `/app/content-manager` lista metadata autorizada con paginación de 20 registros, búsqueda por nombre original y filtros de proyecto, tipo y estado. Desde allí se sube, descarga, previsualiza imagen/PDF, archiva y vincula un asset listo a una pieza editorial. El detalle de una entrega permite subir y seleccionar archivos del mismo proyecto y muestra los archivos exactos de cada versión.
- El único bucket de Phase 8 es `project-files`, privado, con límite global y de bucket de **50 MiB**. Admite JPEG, PNG, WebP, MP4, MOV, PDF, DOC/DOCX, XLS/XLSX y PPT/PPTX. No hay bucket público ni `getPublicUrl()` para estos archivos. El path canónico es `<project_uuid>/<asset_uuid>`; el nombre original sólo se usa para presentar y descargar.
- `prepare_file_asset` valida actor, proyecto, capability, tamaño, MIME declarado y extensión; genera el UUID/path y deja metadata `pending`. La subida real usa Storage API con `upsert: false`. `finalize_file_asset` verifica objeto, bucket/path, MIME y tamaño de la metadata de Storage antes de marcar `ready` y crear `project_files`. Un upload fallido o incompleto no queda utilizable.
- `file_assets` contiene metadata canónica; `project_files`, `content_asset_links` y `deliverable_files` explican cada relación. `submit_deliverable_version` valida assets listos del mismo proyecto y crea los enlaces de versión, ronda y assignments en una transacción. V1 conserva sus archivos al crear V2. Storage no permite UPDATE de objetos; nuevos bytes exigen nuevo asset.
- Las descargas y vistas previas usan la descarga autenticada del bucket privado bajo RLS. La policy permite sólo las operaciones Storage necesarias para listar, leer y borrar mediante comando; bloquea la creación de URLs firmadas incluso para un actor autorizado. No se crean ni cachean URLs firmadas. El cliente sólo puede descargar un asset `ready` enlazado a una versión publicada de un proyecto con membership cliente activa; conocer el path o pertenecer a la Organization no basta.
- El archivo se archiva primero. Sólo `agency_director` con `file.delete_permanently` puede solicitar eliminación física de un asset sin enlaces históricos. El comando pasa por `deleting`, Storage API elimina el objeto y un segundo RPC confirma ausencia y deja metadata `deleted`; si una etapa falla, el estado permite reintentar. `domain_events` y `audit_events` registran el cambio. Nunca se elimina permanentemente un asset de una versión enviada.
- `npm run db:files:diagnose` compara metadata y objetos del stack **local** y reporta pendientes con más de una hora, objetos sin metadata y metadata lista sin objeto. La limpieza de huérfanos exige revisión humana y Storage API. No hay scheduler automático ni malware scanning. MIME y tamaño se validan por metadata declarada y restricciones del bucket; no existe content sniffing confiable ni verificación criptográfica de bytes en esta arquitectura. La subida estándar de Supabase no ofrece progreso de bytes ni cancelación en su API actual; la interfaz anuncia estado y error, y permite cambiar la selección antes de enviar.
- `npm run test:files` prueba upload real, finalize, aislamiento Project/Client, descarga, URL firmada ajena, rutas arbitrarias, overwrite, submit V1/V2, historia y borrado. `npm run db:test` agrega pgTAP de Storage policies y privilegios.

## Client Portal (MVP)

- `/portal` resume proyectos asignados, aprobaciones personales, entregas recientes y notificaciones persistidas.
- `/portal/projects` y `/portal/projects/:projectId` muestran sólo proyectos con `client_memberships` y `project_memberships` activas. Hitos y actividad usan proyecciones explícitas; no se exponen Work Items, Editorial, CRM ni revisiones internas.
- `/portal/approvals` consulta sólo las asignaciones pendientes del actor. `/portal/deliverables/:publicationId` muestra la versión publicada exacta, sus archivos, feedback contextual y la decisión del reviewer asignado. `client_viewer` sólo consulta; `client_reviewer` asignado puede aprobar o pedir cambios. `client_admin` no invita usuarios automáticamente ni obtiene aprobación por su rol.
- `client_publications`, `client_reviews`, `client_review_assignments` y `client_review_decisions` conservan el historial. `record_client_decision` comprueba rol, dos memberships, publicación y assignment bajo locks; la solicitud de cambios permite V3 sin alterar V2. La decisión es inmutable e idempotente. OMNIA consulta ese historial en el detalle interno de la entrega.
- `/portal/documents` lista sólo documentos enlazados a versiones publicadas. Storage mantiene el bucket privado `project-files`; el cliente no puede leer archivos internos, archivados, ajenos o aún no publicados.
- `/portal/settings` ofrece perfil, zona horaria base y cierre de sesión. El centro de notificaciones y las preferencias están en `/portal/notifications`.
- `npm run test:portal` prueba con sesiones Auth reales la secuencia V1 interna → V2 publicada → cambios cliente → V3 publicada → aprobación, además de descarga privada, aislamiento entre usuarios y organizaciones, feedback, reintentos y denegación de dominios internos. Ejecuta `db:reset` antes de integrar si necesitas los fixtures limpios; las suites de integración mutan la DB local.

## Mensajería, notificaciones y Realtime

- `/app/messages` y `/portal/messages` muestran canales autorizados, conversación paginada y contador de no leídos. `/app/notifications` y `/portal/notifications` muestran la bandeja, lectura individual o total, enlaces al recurso y preferencias por categoría.
- Cada Organization cliente activa tiene exactamente un canal general. La migración incorpora a sus miembros cliente activos y los triggers incorporan a los futuros; una membresía suspendida o revocada pierde acceso. La Directora se incorpora como miembro interno. Los canales de Project se crean explícitamente desde el detalle del proyecto y sólo admiten miembros añadidos de forma explícita, con project membership vigente y permisos del actor.
- `send_message` valida sesión, membresía activa, contexto Organization/Project, cuerpo de 1–4000 caracteres y clave de idempotencia. El servidor fija el autor, persiste mensaje, evento y fan-out de notificaciones en una transacción. Los mensajes son inmutables: no hay edición ni borrado. La lectura usa cursor `(created_at,id)` estable y límite de 30.
- La tabla `notifications` de Phase 9 conserva las entregas y aprobaciones y ahora añade mensajes, contexto para enlaces a publicación/entrega y preferencias por usuario. El remitente no recibe aviso propio; el servidor deriva los destinatarios de membresías. `notification_outbox` registra un intento in-app entregado por evento/destinatario/tipo y deduplica reintentos. No hay transporte externo ni worker de entrega en esta fase.
- Sólo `messages` y `notifications` se publican para Supabase Postgres Changes. Cada suscripción usa filtro de canal o destinatario y SELECT RLS. Al reconectar se invalidan consultas para recuperar el estado persistido; al cambiar sesión se eliminan canales Realtime y caché. No hay suscripción global, polling periódico ni Realtime para Work, CRM o Editorial.
- `npm run test:messaging` usa sesiones Auth reales y comprueba mensajes en dos direcciones sin recarga, notificaciones, reintentos, evento ajeno denegado, revocación y alta/suspensión automática del canal general. Necesita stack local y fixtures frescos (`npm run db:reset`); muta la DB local.
- Para revisar visualmente, inicia `npm run dev`, abre `/app/messages`, `/portal/messages` y ambos centros de notificaciones, y prueba con ventanas de 1440, 768 y 390 px. En dos sesiones, envía mensajes, corta/restaura la red y comprueba la reconciliación. `playwright-cli` permite repetir este flujo con browser automatizado.

## Analytics y reporting (Phase 12)

`/app/analytics` ofrece Resumen, Proyectos, Trabajo, Editorial, Entregas y revisiones,
Cobros operativos y Reportes cliente. Es una superficie agregada independiente del
dashboard personal. **Analytics are descriptive, not predictive. Billing analytics
are operational and non-accounting.** No se calcula revenue contable, profit, FX,
forecast ni desempeño individual.

Los RPC especializados `analytics_overview`, `analytics_projects`, `analytics_work`,
`analytics_work_details`, `analytics_editorial`, `analytics_reviews`, `analytics_billing`
y `analytics_billing_details` agregan en PostgreSQL. No se descargan tablas completas,
no hay materialized views, snapshots ni trabajadores de analytics. Los read models
usan `search_path=''`, parámetros SQL y un conjunto de Projects autorizado materializado
en cada consulta. Los datos financieros se consultan por separado. Los drilldowns de
Projects, Work y documentos usan paginación servidor de 20 filas, máximo API 100.

Filtros: Agency (scope del actor o `agency` en URL), Organization, Brand y Project;
periodos inclusivos de 7/30/90 días o fechas personalizadas, hasta **366 días**.
`from`, `to`, `organization`, `brand`, `project`, `currency`, `section` y el drilldown
de Overview quedan en URL. Las opciones se buscan y paginan en servidor sobre el
scope autorizado, sin enumerar catálogos completos. Moneda permite MXN/USD en la
interfaz, y cualquier código ISO de tres letras mediante API/URL. Nunca se suman
monedas distintas. No se convierte moneda.

Las fechas civiles permanecen `date`; instantes `timestamptz` usan límites
`[from 00:00, to+1 00:00)` en `America/Mexico_City`. Series de completados: diario
hasta 31 días, semanal hasta 181, mensual después; buckets sin completados son cero.
El primer bucket semanal/mensual puede empezar antes del rango, pero sólo incluye
instantes dentro de éste. La comparación de completados utiliza el periodo anterior
con igual número de días; no atribuye significancia ni predice resultados.

Todas las métricas se recalculan al consultar y muestran datos actuales, no una
fotografía histórica. TanStack Query usa keys con actor, scope, fechas, moneda,
filtro y página; freshness de 60 segundos. Los comandos marcan analytics stale sin
polling. Actualizar vuelve a consultar las queries activas. Logout/cambio de actor
conserva el borrado de caché existente. No se añade Realtime para Analytics.

| Métrica | Fuente / fórmula | Base temporal | Owner / scope |
|---|---|---|---|
| Clientes activos | Organizations `active_client` distintas en Projects autorizados | Estado actual | Dirección / Projects visibles, no catálogo CRM total |
| Projects por estado | Conteos por `projects.status` | Estado actual | Dirección, PM / Projects autorizados |
| Hitos completos / pendientes | No archivados; `completed/closed` versus `planned/in_progress` | Estado actual | PM / Project |
| Trabajo abierto | Work no archivado, status distinto de `done/cancelled` | Estado actual | PM / Projects |
| Trabajo vencido | Abierto y `due_at < now()` (deadline es instante, no date) | Instante actual | PM / Projects |
| Trabajo bloqueado / prioridad | `blocked`; prioridad de abiertos | Estado actual | PM / Projects |
| Completados / throughput | Work actualmente `done` con `completed_at` en ventana | `completed_at` | PM / Projects |
| Duración de finalización | Mediana `completed_at - created_at`, excluye negativos | Finalizaciones de ventana | PM / Projects; no mediana de eventos históricos reabiertos |
| Antigüedad de abiertos | Mediana `now() - created_at` | Estado actual | PM / Projects |
| Actividad de Project | Conteo / última fecha de `work_item_events` en ventana | `occurred_at` | PM / Project; actividad de Work, no audit total |
| Producción editorial | Planning states actuales, canales y formatos | `scheduled_date` en ventana | PM / Projects; cancelados separados |
| Versiones enviadas | Conteo de versiones, sin joins a reviewers | `submitted_at` en ventana | PM / Projects |
| Revisiones aprobadas / cambios | Conteo de rondas por resultado; interno y cliente separados | `closed_at` en ventana | PM / Projects |
| Publicaciones | Conteo de versiones publicadas a cliente | `published_at` en ventana | PM / Projects |
| Revisiones pendientes | Rondas actualmente `pending` | Estado actual | PM / Projects |
| Tiempo de revisión | Mediana `closed_at - opened_at`; internos/clientes separados, sin negativos | Cierres en ventana | PM / Projects |
| Iteraciones | Mediana de versiones por entrega no archivada | Estado actual, todas sus versiones | PM / Projects; no juicio de desempeño |
| Total documentado | Suma de `total_amount` de documentos `issued/partially_paid/paid` | `billing_documents.date` en ventana | Dirección / scope financiero, por currency |
| Registrado como pagado | Pagos no anulados de esos documentos, currency coincidente | Estado actual de cohorte documental | Dirección / scope financiero, por currency |
| Saldo pendiente | `greatest(total_amount - pagos, 0)` por documento, luego suma | Estado actual de cohorte documental | Dirección / scope financiero, por currency |
| Documentos vencidos / próximos | Saldo positivo, `due_date < hoy México` / hoy hasta hoy+7 | Fecha civil actual | Dirección / scope financiero, por currency |

Authorization: Dirección tiene capabilities de lectura, finanzas, export y publicación;
su Agency limita el scope. PM recibe `analytics.view`, **sólo Projects con membership
interna activa**, nunca toda la Agency. Finanzas requiere conjuntamente
`analytics.view_billing` y `billing.view`, además de acceso al Project; no se concede
automáticamente a PM. Documentos sin Project se incluyen sólo para Dirección con
capabilities financieras en su scope. Contributor no recibe analytics por defecto;
el read model operativo sólo admite roles Dirección/PM. Client no puede invocar
analytics interno. Los filtros explícitos ajenos fallan; el agregado sin filtros
opera sólo sobre Projects autorizados, sin revelar totales de otros clientes.

`/portal/reports` lista **sólo reportes explícitamente publicados** de Projects con
client membership de Organization y Project activas. Organization membership por sí
sola no concede acceso al Project. `project_reports` almacena definición/título/rango
y publicación; no duplica métricas. Crear borrador, publicar o retirar exige
`report.publish`. Las publicaciones/retiros generan domain events; no se auditan
lecturas. La consulta `client_project_report` permite exclusivamente estado de Project,
conteos de hitos, Deliverables publicados distintos, aprobaciones cliente y documentos
publicados. No incluye Work, Editorial, revisiones internas, CRM, identidades internas,
auditoría ni importes. El texto **Reporte actual** distingue su lectura dinámica de
un snapshot inmutable. La lista también tiene RLS y grants por columnas seguras.

La reparación de `client_billing_projections` conserva el contrato de Phase 11,
pero usa `security_invoker=true` sobre `client_billing_documents`, una proyección
autorizada. Documentos de Project exigen ambas memberships; documentos únicamente
de Organization conservan su membership correspondiente. Draft/cancelled/archived
quedan excluidos y los pagos anulados no se cuentan.

Exportar resumen CSV requiere `analytics.export` reevaluado en servidor y llama al
mismo RPC/filtros actuales. Exporta sólo agregados del tab visible, no drilldowns ni
datasets completos. Disponible en Resumen, Trabajo, Editorial, Revisiones y Billing;
Projects y reportes cliente no tienen export. CSV escapa comillas, delimitadores,
saltos y prefijos de fórmula `= + - @`, incluso tras whitespace/caracteres de control.
No existe PDF, almacenamiento de exports ni diseñador de reportes.

Verificación específica: `npm run db:reset`, `npm run db:test`, `npm run test:analytics`,
`npm run db:lint`, `npm run db:types`, `npm run db:types:check`,
`npx supabase db advisors --local`, y los gates frontend/regresiones de abajo.
`test:analytics` carga fixtures dedicados desde el bloque de fixtures pgTAP (sin
alterar `seed.sql`) y usa las credenciales deterministas. Sus filas persistentes
quedan en el Project **Analytics fixture** hasta el siguiente reset; la prueba de
volumen de 2,400 Work Items y 300 documentos con 600 líneas y 600 pagos ocurre
en transacción con rollback. Ejecútalo sobre DB
limpia; las regresiones mutantes se ejecutan secuencialmente con resets apropiados.
`node scripts/verify-phase12-regressions.mjs` ejecuta las once suites anteriores
con un reset local entre cada una y guarda evidencia en `artifacts/phase-12`.

QA: `npm run dev`; `npx playwright cli` sobre `/app/analytics` y `/portal/reports`,
1440/768/390 px, login `director@omnia.local` o `client.admin.a@omnia.local` con
password fijo del harness (`scripts/test-fixtures/credentials.mjs`). Fixtures conocidos:
Project `60000000-0000-0000-0000-0000000012a1`, ventana `2026-09-01`–`2026-09-30`,
MXN documentado 15,000/pagado 5,000/pendiente 10,000; USD documentado 1,000.
Con el navegador CLI abierto (`npx playwright cli open`), ejecutar
`npx playwright cli run-code --filename=scripts/qa-phase12-playwright.js` reproduce
la comprobación de filtros, gráficos, export, estados y responsive.

## Gates de verificación

Con Supabase y `functions:serve` activos:

```bash
npm run db:test
npm run db:lint
npm run db:types
npm run db:types:check
npm run typecheck
npm run lint
npm run test
npm run test:connectivity
npm run test:auth
npm run test:crm
npm run test:work
npm run test:dashboard
npm run test:editorial
npm run test:deliverables
npm run test:files
npm run test:portal
npm run test:messaging
npm run test:billing
npm run test:analytics
npm run db:files:diagnose
npm run build
```

| Comando | Evidencia |
|---|---|
| `npm run db:reset` | Reconstruye únicamente la DB local desde migrations + seed |
| `npm run db:test` | Ejecuta pgTAP de schema, privilegios, RLS, roles, grants, aislamiento, Projects, Work y My Space |
| `npm run db:lint` | Ejecuta `plpgsql_check` sobre `public` y `app_private` |
| `npm run db:types` | Regenera `database.types.ts`; no se edita manualmente |
| `npm run db:types:check` | Falla si los tipos generados no coinciden con la DB local |
| `npm run test` | Unit/component tests sin depender de Docker |
| `npm run test:connectivity` | Cliente real contra la API local |
| `npm run test:auth` | Bootstrap → login → recovery → invitaciones/Mailpit → aceptación → restore/logout → aislamiento A/B |
| `npm run test:crm` | Flujos director/PM/client contra Auth, RLS, RPC, events y proyecciones locales |
| `npm run test:work` | Flujo Director/PM/contributor/client: Project → members → milestone → assignment → My Space → transition/comment → archive, más aislamiento personal |
| `npm run test:dashboard` | Flujo contributor/PM/client: guardar → recargar → mover/quitar/añadir → reset, gating CRM, RLS y conflicto CAS entre dos sesiones |
| `npm run test:editorial` | PM → ciclo/plantilla/pieza → disponible → dos postulaciones → aceptación → Work/My Space/events; dos sesiones PM compiten por aplicaciones distintas; aislamiento, revocación y asignación manual |
| `npm run test:deliverables` | Configuración → entrega V1 → cambios → V2 → aprobación; retries, carreras de submit/decisión/override, publicación, aislamiento y auditoría |
| `npm run test:files` | Storage API real, metadata, RLS, ataques de path/overwrite, V1/V2 con archivos y eliminación restringida |
| `npm run test:portal` | Auth real, publicación exacta, archivos privados, cambios V2→V3, aprobación e aislamiento cliente |
| `npm run test:messaging` | Auth real, Realtime bidireccional, notificaciones, idempotencia, revocación y auto-membership local |
| `npm run db:files:diagnose` | Diagnóstico local de drift DB ↔ Storage sin mutar objetos |
| `npm run build` | TypeScript + bundle production de Vite |

Para detener sólo este stack:

```bash
npm run db:stop
```

La fuente arquitectónica y de secuencia es [OMNIA_CRAFT_ACTION_PLAN.md](./OMNIA_CRAFT_ACTION_PLAN.md).
