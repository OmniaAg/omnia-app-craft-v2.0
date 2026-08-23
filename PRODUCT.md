# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

OMNIA Craft sirve a dos grupos aislados: el equipo interno de la agencia OMNIA y los usuarios de sus organizaciones cliente. El equipo interno opera con roles y scopes explícitos; los clientes consultan únicamente el contexto de su propia organización y, en fases posteriores, sólo los Projects asignados de forma independiente.

## Product Purpose

OMNIA Craft 2.0 es el sistema operativo de una sola agencia. Centraliza identidad, autorización y flujos operativos con trazabilidad server-side. El éxito exige que cada actor llegue a su contexto correcto y que ninguna ruta, metadata de usuario o manipulación del frontend pueda ampliar su autoridad.

## Positioning

El producto separa explícitamente membership, capability y scope de recurso. La autoridad vive en PostgreSQL RLS y comandos transaccionales auditados; el frontend sólo proyecta permisos para UX.

## Operating Context

- Superficie interna en `/app` y superficie cliente en `/portal`.
- Desarrollo local-first con Supabase CLI, PostgreSQL, Auth y Mailpit.
- Agencia única OMNIA con departamentos AXIS, LUX, IMAGO, AGORA, PRAXIS y NEO KIN.
- Organization admite múltiples usuarios cliente; Organization membership nunca concede Project authorization.
- Timezone base `America/Mexico_City`; los instantes persistentes representan tiempo absoluto.

## Capabilities and Constraints

- Roles operativos internos: `agency_director`, `project_manager`, `contributor`.
- Roles cliente: `client_admin`, `client_reviewer`, `client_viewer`.
- `founder` y department son clasificación organizacional, no autoridad.
- Profiles contienen identidad presentacional y nunca roles, permisos o scopes.
- Lifecycle archive-first; audit history es inmutable.
- Phase 3 incluye login, autorización, Organizations, Brands, Contacts, Opportunities, pipeline, CRM Activities y aislamiento Organization/Brand A/B.
- Phase 3 excluye Projects, Work, Storage, Realtime, Billing, Analytics, AI e Integrations.

## Brand Commitments

Conservar el nombre OMNIA Craft, los logos existentes y la identidad visual ya implementada con Lexend, Quicksand y los colores OMNIA. Las superficies de Auth deben ser funcionales, contenidas y coherentes con la app, no un rediseño de marca.

## Evidence on Hand

- Fuente arquitectónica: `OMNIA_CRAFT_ACTION_PLAN.md`.
- Logos y assets de marca: `src/assets/images/brand/`.
- Tokens y estilos existentes: `src/styles/`.
- No hay testimonios, claims comerciales ni métricas que deban inventarse.

## Product Principles

- RLS y comandos server-side son la autoridad.
- Least privilege por defecto; capability y resource scope se evalúan por separado.
- Flujos críticos son atómicos, idempotentes y auditables.
- Las superficies interna y cliente comparten identidad, no datos ni autorización implícita.
- Cada fase implementa sólo el dominio necesario y conserva gates reproducibles.

## Accessibility & Inclusion

Las superficies de autenticación deben ofrecer labels visibles, navegación por teclado, foco perceptible, feedback de error junto al campo, estados de carga anunciados y compatibilidad con password managers y pegado de credenciales.
