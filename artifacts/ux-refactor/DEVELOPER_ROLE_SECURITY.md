# Developer y autorización

El rol equivalente a Boss en este repositorio es `agency_director`. Se añade `developer` como rol Agency independiente. `public.authorization_role(text)` normaliza exclusivamente Developer a Agency Director para decisiones de autoridad. Memberships, invitaciones y eventos conservan el identificador real.

La migración adapta comparaciones y joins en funciones existentes de public/app_private y la política directa de lectura de `pipeline_stages`. Esta última se detectó al probar cambio de etapa en el navegador: el join literal dejaba Developer sin opciones. No se copiaron grants parciales que pudieran divergir de Dirección.

| Actor | Límite conservado |
|---|---|
| Dirección / Developer | Misma autoridad efectiva dentro de su Agency; identidad diferente |
| Project Manager | Proyectos, organizaciones y grants explícitos autorizados; no adquiere autoridad por llamarse Developer en metadata |
| Contributor | Trabajo y participación permitidos, sin autopromoción ni gestión general de workflows |
| Client Admin | Superficie cliente y capacidades existentes; no adquiere decisiones reservadas a un reviewer asignado |
| Client Reviewer | Decisiones únicamente sobre versión publicada y asignación válida |
| Client Viewer | Lectura publicada autorizada, sin autoridad interna |
| Suspendido / anónimo | Sin acceso adquirido por una sesión antigua o por un borrador |

RLS y comandos siguen revalidando membresía, Agency, organización, proyecto y recurso. La normalización no cambia el alcance de un rol. No se amplían permisos de service_role para facilitar fixtures. Las pruebas locales preparan registros mediante SQL local explícito cuando es necesario.

La suite SQL compara todas las combinaciones proyecto/capacidad, permisos de automatizaciones, canales y lectura directa de etapas; prueba invitaciones, Agency ajena, suspensión y aislamiento de borradores. Las sesiones Auth reales comparan filas y capacidades de Dirección/Developer y rechazan autopromoción y propietario falsificado. Cantidades y resultado final: [VERIFICATION.md](VERIFICATION.md).
