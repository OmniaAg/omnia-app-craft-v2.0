# OMNIA Craft 2.0

Foundation local de Identity, Auth & Authorization de OMNIA Craft. Phase 2 incorpora Supabase Auth, memberships internas y cliente, capabilities con scope explícito, RLS, comandos transaccionales, invitaciones por Edge Function, Mailpit, domain/audit events y las superficies React mínimas de acceso.

No incluye CRM, Brands, Projects, dashboard ni configuración remota: esas áreas quedan fuera de Phase 2.

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
- RLS está habilitado y forzado. Los catálogos y eventos son server-managed; no hay escrituras genéricas desde el browser.
- Invitaciones, aceptación y mutaciones sensibles usan comandos transaccionales, idempotencia y domain/audit events. La Edge Function valida sesión, origen, contrato y scope antes de usar credenciales server-side.

## Bootstrap y fixtures locales

`supabase/seed.sql` crea fixtures deterministas para pruebas:

- una Directora OMNIA;
- PM sin grants y PM con `client_user.invite` sólo para Organization A;
- contributor clasificado como founder para probar que la clasificación no eleva privilegios;
- client admin/reviewer/viewer en Organization A y viewer en Organization B;
- seis departamentos y dos organizaciones mínimas.

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
npm run build
```

| Comando | Evidencia |
|---|---|
| `npm run db:reset` | Reconstruye únicamente la DB local desde migrations + seed |
| `npm run db:test` | Ejecuta pgTAP de schema, privilegios, RLS, roles, grants, aislamiento e invitaciones |
| `npm run db:lint` | Ejecuta `plpgsql_check` sobre `public` y `app_private` |
| `npm run db:types` | Regenera `database.types.ts`; no se edita manualmente |
| `npm run db:types:check` | Falla si los tipos generados no coinciden con la DB local |
| `npm run test` | Unit/component tests sin depender de Docker |
| `npm run test:connectivity` | Cliente real contra la API local |
| `npm run test:auth` | Bootstrap → login → recovery → invitaciones/Mailpit → aceptación → restore/logout → aislamiento A/B |
| `npm run build` | TypeScript + bundle production de Vite |

Para detener sólo este stack:

```bash
npm run db:stop
```

La fuente arquitectónica y de secuencia es [OMNIA_CRAFT_ACTION_PLAN.md](./OMNIA_CRAFT_ACTION_PLAN.md).
