# OMNIA Craft 2.0

Foundation local de Identity, Auth & Authorization, CRM y operación de proyectos de OMNIA Craft. Phase 4 completa `Organization → Brand → Project`, añade memberships explícitas, milestones, Work Items canónicos y My Space.

No incluye dashboard configurable, editorial, deliverables, reviews, Realtime, Storage operacional ni configuración remota.

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

Los usuarios seeded no tienen contraseña reutilizable. `npm run test:auth` asigna passwords aleatorias en memoria mediante la clave server local, nunca las imprime y sólo opera si API y Mailpit usan los puertos loopback esperados. El primer director existe por un bootstrap administrativo explícito del seed; ningún signup trigger concede membresía o rol. El bootstrap productivo se definirá en la fase de deployment, no aquí.

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

Crear, asignar, transicionar, comentar y archivar trabajo pasa por RPCs transaccionales. React no encadena escrituras directas; invalida caches de proyecto, trabajo o My Space de forma dirigida. No hay Realtime, polling, Kanban ni drag-and-drop.

## Verificación

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
| `npm run build` | TypeScript + bundle production de Vite |

Para detener sólo este stack:

```bash
npm run db:stop
```

La fuente arquitectónica y de secuencia es [OMNIA_CRAFT_ACTION_PLAN.md](./OMNIA_CRAFT_ACTION_PLAN.md).
