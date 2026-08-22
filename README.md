# OMNIA Craft 2.0

Foundation frontend y backend local de OMNIA Craft. Phase 1 incorpora un stack oficial de Supabase CLI aislado, migraciones imperativas, pgTAP, tipos generados y un adapter tipado para React. Todavía no existen Auth UI, tablas de producto ni funcionalidades de Phase 2.

## Requisitos

- Node.js `>=24.15.0`
- npm `>=11.0.0`
- Docker Desktop en ejecución

La CLI Supabase `2.115.0` está fijada como dev dependency; no se necesita una instalación global. npm es el único package manager autorizado y `package-lock.json` es el único lockfile.

## Instalación

```bash
npm install
```

Crea el environment local del frontend:

```powershell
Copy-Item .env.example .env.local
```

Tras iniciar Supabase, ejecuta `npm run db:status` y copia únicamente `PUBLISHABLE_KEY` a `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca copies `SECRET_KEY`, `SERVICE_ROLE_KEY`, `JWT_SECRET` ni credenciales DB a variables `VITE_*`.

## Supabase local

El flujo usa exclusivamente los containers administrados por Supabase CLI; no hay un `docker-compose.yml` ni un PostgreSQL manual.

> El flujo local de OMNIA Craft no requiere `supabase login` ni `supabase link`.

La vinculación a un proyecto remoto queda reservada para una fase posterior de deployment/release.

### Identidad y puertos aislados

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

SMTP/POP3, Analytics y pooler permanecen deshabilitados y no exponen puertos. Este rango no debe reutilizarse para otros stacks locales.

### Operación diaria

```bash
npm run db:start
npm run db:status
npm run db:reset
npm run db:test
npm run db:lint
npm run db:types
npm run test:connectivity
npm run dev
```

`db:reset` destruye y reconstruye únicamente la base local identificada como `omnia-craft`; reaplica migraciones y `supabase/seed.sql`. `db:types` genera `src/shared/api/supabase/database.types.ts` desde la DB local y no debe editarse manualmente.

Para detener sólo este stack desde el directorio del proyecto:

```bash
npm run db:stop
```

## Environment contract

El frontend requiere:

```env
VITE_APP_URL=http://localhost:5173
VITE_SUPABASE_URL=http://127.0.0.1:56321
VITE_SUPABASE_PUBLISHABLE_KEY=<LOCAL_PUBLISHABLE_KEY>
```

La CLI local actual entrega una publishable key. El parser admite `VITE_SUPABASE_ANON_KEY` sólo como fallback legacy y exige exactamente una de las dos. `.env.local` y `supabase/.env.local` están ignorados por Git.

## Database baseline

- Las migraciones versionadas son la única fuente de verdad; no se usa `supabase/schemas/`.
- `public.health_check()` es una RPC `SECURITY INVOKER` mínima para comprobar conectividad.
- `app_private` no está expuesto y revoca acceso a `PUBLIC`, `anon` y `authenticated`.
- El seed es deliberadamente vacío de datos de dominio.
- pgTAP valida schema, privilegios y la RPC; una ejecución con cero tests es un fallo en CLI `2.115.0`.
- No se creó una Edge Function: Phase 1 no tiene todavía un caso que justifique helpers CORS/auth vacíos. Cuando exista una Function real, deberá servirse con `supabase functions serve --env-file supabase/.env.local` y probar preflight/orígenes permitidos.

## Frontend

El adapter vive en `src/shared/api/supabase/`. Las screens no llaman directamente a `supabase.from()`. El helper de diagnóstico usa los tipos generados y la RPC local sin dejar una pantalla permanente de estado.

Si el puerto `5173` está ocupado, Vite seleccionará otro puerto para la verificación local; las URLs de Auth configuradas siguen apuntando al puerto contractual `5173`.

## Gates

| Comando | Propósito |
|---|---|
| `npm run typecheck` | Verifica TypeScript 6 |
| `npm run lint` | Ejecuta Oxlint sobre código, scripts y configs |
| `npm run test` | Ejecuta unit/component tests sin depender de Docker |
| `npm run build` | Genera el build production de Vite |
| `npm run db:reset` | Reconstruye la DB local desde migrations + seed |
| `npm run db:test` | Ejecuta pgTAP; debe ejecutar al menos una prueba |
| `npm run db:lint` | Ejecuta plpgsql-check en `public` y `app_private` |
| `npm run db:types` | Regenera tipos TypeScript desde PostgreSQL local |
| `npm run test:connectivity` | Prueba el cliente real contra la API local |

La fuente arquitectónica y de secuencia es [OMNIA_CRAFT_ACTION_PLAN.md](./OMNIA_CRAFT_ACTION_PLAN.md).
