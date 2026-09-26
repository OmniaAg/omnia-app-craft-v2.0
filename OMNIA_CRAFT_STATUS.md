# OMNIA Craft — Estado actual

## 1. Resumen ejecutivo
1. El proyecto cuenta con una base arquitectónica robusta y moderna (React 19, Vite, Supabase).
2. La calidad del código base es alta, sin deuda técnica evidente en lo ya construido.
3. El modelo de datos, la seguridad (RLS) y las migraciones de las Fases 0 a 5 están sólidamente implementados.
4. Los módulos internos de la agencia (Auth, CRM, Projects, Work, My Space, Dashboard) están funcionales y conectados con el backend.
5. Existe una cobertura importante de tests de integración tanto en backend (pgTAP) como scripts de conectividad.
6. El portal de clientes es actualmente un mock ("Client Portal") y carece de flujos reales.
7. Módulos clave de operación (Archivos, Entregables, Revisiones) no han sido iniciados.
8. Módulos de soporte (Facturación, Analítica, IA) no han sido iniciados.
9. No se detecta código "abandonado" o desconectado; el repositorio es coherente con su plan de acción hasta la Fase 5.
10. El proyecto está en un estado muy saludable, pero requiere priorización estricta para lograr un MVP público funcional antes de noviembre 2026.

## 2. Arquitectura actual
**Stack:**
- **Frontend:** React 19, Vite, TypeScript, React Router 7, TanStack Query, React Hook Form + Zod.
- **Backend:** Supabase (PostgreSQL 15), Row Level Security (RLS) avanzado, pgTAP para testing de base de datos.
- **Patrones:** Arquitectura orientada a eventos en backend (`domain_events`, `audit_events`), funciones privadas en `app_private` para by-pass seguro de RLS, control de accesos granular basado en Capabilities (RBAC/ABAC híbrido).
- **Tooling:** Oxlint, Vitest, npm.

La arquitectura no delega la seguridad al frontend; todas las restricciones de estado y acceso se validan estrictamente en la base de datos a través de políticas y funciones PL/pgSQL.

## 3. Estado por módulo

| Módulo | Estado | Qué funciona | Qué falta | Evidencia/archivos relevantes |
|--------|--------|--------------|-----------|-------------------------------|
| **Base / Auth** | TERMINADO | Login, recuperación, ruteo por roles, carga de capabilities, tests de integración. | Integración final con correos reales (SMTP/OAuth en producción). | `src/features/auth/*`, `migrations/20260822230805...`, `scripts/test-auth-integration.mjs` |
| **Organizaciones & Brands** | TERMINADO | Creación/edición de orgs, marcas, promoción de estado (lifecycle), queries de TanStack. | N/A | `src/features/crm/screens/OrganizationDetailScreen.tsx` |
| **CRM (Pipeline & Contactos)** | TERMINADO | Pipeline server-managed, oportunidades, etapas, contactos, actividades/timeline. | N/A | `src/features/crm/screens/OpportunitiesScreen.tsx`, `migrations/20260823002506...` |
| **Projects** | TERMINADO | Creación, asignación de miembros (internal/client), roles (lead/member), hitos, listados. | N/A | `src/features/projects/*`, `migrations/20260823011709...` |
| **Work Items & Actividades** | TERMINADO | Creación de tareas, estados, asignaciones, transiciones protegidas, comentarios básicos. | Vistas de tablero kanban (si se requieren), filtros complejos. | `src/features/work/*`, `migrations/20260823011709...` |
| **My Space / Dashboard** | TERMINADO | Cuadrícula redimensionable (react-grid-layout), persistencia, listado de trabajo personal (overdue, today, upcoming). | Nuevos widgets futuros. | `src/features/dashboard/*`, `src/features/my-space/*`, `migrations/20260823023216...` |
| **Client Portal** | SOLO ESTRUCTURA / MOCK | Enrutamiento básico (`/portal`). | Todo. Interfaz, visualización de proyectos, entregables, aprobaciones. | `src/features/foundation/PortalHome.tsx` |
| **Archivos & Entregables** | NO IMPLEMENTADO | N/A | Schema, Storage, UI, flujos de revisión. | N/A |
| **Facturación / Analítica** | NO IMPLEMENTADO | N/A | Todo. | N/A |
| **Notificaciones In-App** | NO IMPLEMENTADO | N/A | Outbox, persistencia de notificaciones, campana de UI. | N/A |

## 4. Flujos completos actualmente funcionales
1. **Onboarding interno:** Login de director/agencia, validación de sesión y redirección basada en contexto.
2. **Ciclo de CRM:** Creación de un Prospecto -> Creación de Marca -> Registro de Contactos -> Creación de Oportunidad -> Transición de Etapas del Pipeline -> Registro de Actividades -> Promoción a Cliente Activo.
3. **Gestión de Proyectos:** Creación de proyecto bajo una marca -> Asignación de miembros internos -> Creación de hitos -> Archivo de proyecto.
4. **Ejecución de Trabajo:** Creación de Work Items -> Asignación a miembros -> Transición de estados (todo -> done) -> Reflejo automático en "My Space".
5. **Personalización:** Modificación de layout del Dashboard -> Persistencia en base de datos -> Manejo de conflictos de versión.

## 5. Trabajo incompleto
Ordenado por dependencia lógica para un MVP:
1. **Client Portal:** Faltan las pantallas donde el cliente (con rol de client) puede ver sus proyectos y progreso.
2. **Files & Content Manager:** Supabase Storage, vinculación de archivos a Work Items y Proyectos. Dependencia crítica para que la agencia entregue trabajo.
3. **Reviews & Approvals:** Lógica de estados para que un entregable pase de borrador a revisión interna, publicación al cliente, y aprobación/rechazo.
4. **Notificaciones y Mensajería mínima:** Sistema de notificaciones asíncronas para avisar de comentarios, asignaciones y aprobaciones.

## 6. Bugs, riesgos y deuda técnica
- **Críticos:** Ninguno evidente. El código está limpio y tipado.
- **Importantes:** 
  - Las transiciones de base de datos confían fuertemente en funciones PL/pgSQL y RLS (`app_private.project_permission`, `emit_event`). Si la complejidad aumenta mucho, el testing exclusivo de DB se volverá un cuello de botella.
  - No hay un sistema real de notificaciones. Cuando múltiples usuarios colaboren, la falta de asincronía/realtime causará recargas manuales (F5).
- **Menores:** 
  - La interfaz de "Client Portal" (`PortalHome.tsx`) expone explícitamente que la Fase 9 no está construida. Debe reemplazarse antes del lanzamiento.
  - Dependencia de componentes básicos de UI que podrían requerir más pulido visual (no se revisaron los CSS en profundidad pero parecen estándar).

## 7. Seguridad y permisos
**Excepcional.**
- El RLS está implementado de forma segura mediante un schema protegido `app_private`.
- Las llamadas a funciones de validación (como `app_private.project_permission`) son robustas y bloquean el acceso horizontal.
- Hay distinción clara entre membresías de agencia (`agency_memberships`), clientes (`client_memberships`) y proyectos (`project_memberships`).
- Existe un sistema de roles y capabilities funcional que permite que la UI oculte botones (`auth.hasCapability('project.create')`) mientras el backend simultáneamente bloquea los mutaciones.

## 8. Qué falta para MVP público
Para lanzar en noviembre 2026 de forma coherente y útil, falta construir **exclusivamente**:
1. **Files / Content Manager:** Integración con Storage para subir y visualizar assets.
2. **Deliverables & Approvals:** Sistema para que el cliente reciba un archivo, deje feedback o apruebe.
3. **Client Portal MVP:** Las vistas en `/portal` para que los clientes activos (que ya se pueden crear en el CRM) puedan consumir los proyectos y entregables.
4. **Notificaciones mínimas:** Avisos por correo transaccional (SMTP) y un centro in-app básico para menciones/asignaciones.

## 9. Qué posponer después del lanzamiento
Todo lo que no bloquee el intercambio de trabajo fundamental entre Agencia y Cliente:
1. Billing, cotizaciones e integración con pasarelas de pago.
2. Módulos de analítica, reportes de horas y dashboards avanzados.
3. Integraciones de IA, automations y webhooks.
4. PWA y notificaciones Push móviles.
5. Migración de datos legacy.

## 10. Recomendación de siguiente etapa
El próximo roadmap no debe enfocarse en reestructurar ni "mejorar" lo existente. El equipo de desarrollo debe moverse inmediatamente a resolver los siguientes frentes:
- Habilitar **Supabase Storage** y crear el dominio de **Files**.
- Modelar el flujo de **Revisiones y Aprobaciones** (Deliverables).
- Construir la experiencia **Client Portal**, conectando a los clientes (actualmente aislados) con sus proyectos y entregables autorizados.

---

## Evidencia revisada
- **Archivos de Configuración:** `package.json`, `vite.config.ts`, `vitest.config.ts`
- **Frontend Core:** `src/app/router/routes.tsx`
- **Módulos Frontend inspeccionados:** `src/features/auth`, `src/features/crm`, `src/features/projects`, `src/features/work`, `src/features/dashboard`, `src/features/my-space`, `src/features/foundation`
- **Backend / Base de datos:** `supabase/migrations/` (Fases 2 a 5 completas), `supabase/tests/database/`
- **Scripts de Integración:** `scripts/test-auth-integration.mjs`, `scripts/test-crm-integration.mjs`, etc.
- **Documentación:** `OMNIA_CRAFT_ACTION_PLAN.md` (Para contraste histórico)
