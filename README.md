# OMNIA Craft 2.0

Foundation frontend del futuro sistema operativo interno de la agencia OMNIA y de su portal aislado para organizaciones cliente.

El repositorio está actualmente en **Phase 0 — Architecture & Developer Foundation**. Incluye arquitectura de aplicación, providers, routing y shells placeholder; todavía no incluye Auth, Supabase, base de datos ni funcionalidades de negocio.

## Requisitos

- Node.js `>=24.15.0`
- npm `>=11.0.0`

La foundation se verificó con Node.js `24.18.0` y npm `11.16.0`. npm es el único package manager autorizado y `package-lock.json` es el único lockfile.

## Instalación

```bash
npm install
```

Crea la configuración local opcional a partir del contrato público:

```bash
cp .env.example .env.local
```

En PowerShell puedes usar `Copy-Item .env.example .env.local`. Phase 0 funciona también sin `.env.local` y usa `http://localhost:5173` como valor local de `VITE_APP_URL`.

## Desarrollo

```bash
npm run dev
```

Si una política de ejecución de PowerShell bloquea `npm.ps1`, usa el ejecutable equivalente `npm.cmd run dev`; no es necesario cambiar la política del sistema.

## Gates disponibles

| Comando | Propósito |
|---|---|
| `npm run typecheck` | Verifica TypeScript 6 |
| `npm run lint` | Ejecuta Oxlint sobre código y configs del proyecto |
| `npm run test` | Ejecuta tests de render, router, environment y fallback |
| `npm run build` | Genera el build production de Vite |
| `npm run preview` | Sirve localmente el build generado |

## Estructura actual

```text
src/
├── app/
│   ├── providers/   # Query provider y error boundary
│   ├── router/      # Route objects y lazy routes
│   └── shells/      # Internal App y Client Portal
├── features/
│   └── foundation/  # Placeholders de Phase 0
├── shared/
│   ├── config/      # Environment contract con Zod
│   └── ui/          # UI compartida mínima OMNIA
└── styles/          # Fonts, tokens y estilos de aplicación
```

Los assets, tokens y fuentes Lexend/Quicksand existentes son la fuente visual. Los guards frontend futuros serán únicamente UX; la autorización real será responsabilidad del backend.

## Backend

Supabase comienza en **Phase 1**. Phase 0 no instala Supabase, no requiere variables Supabase, no crea tablas y no ejecuta Docker.

La fuente arquitectónica y de secuencia es [OMNIA_CRAFT_ACTION_PLAN.md](./OMNIA_CRAFT_ACTION_PLAN.md).
