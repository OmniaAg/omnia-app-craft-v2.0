# Arquitectura de información

El router sigue siendo la fuente de destinos. La navegación utiliza `src/shared/navigation/navigation.ts`; cada destino conserva su ruta y predicado de capacidad. Los accesos de contexto permanecen junto al proyecto, entrega o documento correspondiente.

| Internal | Destinos |
|---|---|
| Inicio | Dashboard |
| Trabajo | Mi Espacio, Proyectos, Revisiones |
| Clientes | Cuentas, Contactos, Oportunidades |
| Contenido | Editorial, Archivos |
| Gestión | Analytics, Billing, Automatizaciones, Integraciones |
| Más | Mensajes, Notificaciones, Configuración |

| Portal | Destinos |
|---|---|
| Resumen | Resumen del cliente |
| Proyectos | Proyectos y su detalle |
| Aprobaciones | Cola de decisiones asignadas |
| Mensajes | Conversaciones autorizadas |
| Más | Documentos, Reportes, Notificaciones, Configuración |

Los grupos vacíos desaparecen por permisos; esto no constituye autorización. AuthGate, RPC y RLS mantienen los límites reales. Developer y Dirección usan la misma autoridad operativa, con identificadores de rol diferentes. Los roles cliente mantienen sus diferencias de lectura, comentarios y decisiones asignadas.

Las subrutas de revisores, editorial, asistente, entregas, conversaciones y notificaciones se mantienen accesibles desde enlaces contextuales. Analytics conserva sus siete secciones; CRM sus cinco pestañas; Editorial agenda/calendario y detalle. No se añadió una segunda arquitectura de navegación para móvil.
