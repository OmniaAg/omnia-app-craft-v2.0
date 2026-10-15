# Auditoría de experiencia

Alcance: router completo, Internal, Portal, autenticación, componentes compartidos, formularios, paneles y estados de permisos. El inventario AST y la evidencia de navegador se concilian en [COVERAGE_MATRIX.md](COVERAGE_MATRIX.md). Un inventario estático no acredita por sí solo una prueba funcional.

| ID | Hallazgo comprobado | Resolución |
|---|---|---|
| F01 | Demasiados destinos simultáneos en la cabecera interna | Navegación superior agrupada y compartida con Portal; destinos conservados y filtrados por capacidades |
| F02 | Renovar la sesión del mismo usuario desmontaba el formulario | AuthProvider conserva el árbol y la autorización actual durante una renovación del mismo actor; cambio de actor y rechazo real cierran el acceso |
| F03 | Edición sin recuperación tras recarga o fallo de red | Borradores privados en servidor, confirmación visible, conflictos entre pestañas, reintento y descarte explícito |
| F04 | Dashboard centrado en listas sin lectura operativa inmediata | Prioridades reales de Analytics, medidores con denominador explícito y cuatro widgets iniciales; biblioteca completa conservada |
| F05 | Un widget vecino interceptaba clics del menú de tamaño | Contexto de apilamiento y elevación del widget con menú abierto |
| F06 | Automatizaciones difíciles de leer como secuencia | Disparador, condiciones y acciones conectadas, orden editable, vista previa y estados de configuración |
| F07 | Billing solicitaba identificadores manuales y pagos mediante prompt | Selector autorizado de organización/proyecto y formulario de pago con moneda correcta |
| F08 | Un documento creado sin conceptos no podía emitirse por validación del motor | Creación atómica de borrador y concepto; emisión, publicación y pagos siguen usando los comandos financieros existentes |
| F09 | Los editores CRM ignoraban capacidades de ámbito Agency | Comprobación del ámbito Organization o Agency según el recurso real |
| F10 | UUID válidos en PostgreSQL eran rechazados por validación RFC en formularios | Validación GUID compatible con los identificadores autoritativos y prueba de regresión |
| F11 | Developer no recibía opciones de etapas por una política RLS directa | La política usa la misma normalización canónica que las funciones de permisos; clientes continúan sin acceso |
| F12 | Guardar y limpiar un borrador podía cerrar demasiado pronto el editor | Campos bloqueados durante la operación; limpieza confirmada; reintento de finalización sin repetir la creación |
| F13 | Perfiles de fixtures sin nombre aparecían como «Miembro» | Edición del nombre propio mediante los permisos de perfil existentes, sin asignar autoridad desde el perfil |
| F14 | Cargar el layout del servidor conservaba la advertencia de conflicto anterior | Restablecer la mutación después de una recarga válida o reset; prueba de regresión roja y verde |
| F15 | El rechazo de borrar un archivo vinculado mostraba un código técnico con contraste insuficiente | Mensaje que explica el límite y texto legible sobre la superficie de error |
| F16 | Pestañas CRM parcialmente visibles y selección sin estilo | Reflujo de botones completos y estilo compartido para aria-selected y aria-pressed |
| F17 | Los estilos genéricos podían agrandar y separar checkboxes de responsables | Regla específica del checklist; controles nativos y etiquetas alineadas en nueve tamaños |
| F18 | El compositor podía salir de la superficie al abrir miembros | Altura natural del panel, historial y lista de canales acotados; geometría verificada cerrado/abierto/enviado |
| F19 | Recargar tras fallar la limpieza podía recuperar un mensaje ya enviado con una clave nueva | Clave idempotente en el borrador privado, flush antes del envío y entrada local limpia tras confirmación; replay devuelve el mismo ID |

Se conservan las tablas, filtros, paginación, historial, decisiones y confirmaciones cuyo comportamiento ya expresa una necesidad del negocio. No se eliminaron módulos para reducir el número de controles. Las acciones destructivas siguen explícitas y los comandos de dominio revalidan permisos.

La auditoría automatizada mide navegación, respuestas, foco, reflujo y conservación de estado. No sustituye una investigación con usuarios ni permite atribuir mejoras de tiempo o satisfacción a personas que no participaron.
