# Conservación del trabajo

La reproducción inicial mostró que una renovación de sesión del mismo actor cambiaba AuthProvider a loading y desmontaba AuthGate. El formulario perdía su estado. La corrección mantiene la pantalla durante SIGNED_IN/TOKEN_REFRESHED del mismo actor y errores de verificación transitorios. La regresión se comprobó en rojo y verde con una respuesta de Auth demorada; la comparación de navegador inicial también registró la pérdida.

| Estado | Propietario y duración |
|---|---|
| Filtros, pestañas, recurso seleccionado | URL cuando ya existe ese contrato |
| Datos confirmados | PostgreSQL y caché de consultas, invalidada según los comandos existentes |
| Borrador privado | Servidor, actor + tipo + alcance + clave; caduca a los 30 días |
| Edición sin autosave | Memoria y confirmación explícita antes de descartar |
| Archivo por subir | Memoria, cancelación y advertencia al salir; no se serializa el archivo |
| Credenciales de integración | Campo sólo escritura, sin autosave ni variables de caché de mutación |

`user_drafts` tiene RLS, sin escritura directa para authenticated. Los RPC comprueban propietario, permisos actuales y alcance. Project valida la marca seleccionada dentro de su Agency; Work, Editorial y Automation usan proyecto; Message usa canal. Se rechazan campos de secreto y cuerpos de más de 64 KiB.

Una revisión monotónica global y bloqueo de concurrencia protegen comparación y guardado. La revisión no se reutiliza al caducar o borrar una fila: una pestaña antigua no puede sobrescribir un borrador recreado. Limpiar deja una revisión confirmada, evitando resucitar contenido enviado. Un cron elimina vencidos; RLS deja de exponerlos antes de esa limpieza.

El autosave espera 600 ms sin bloquear la escritura. «Borrador guardado» sólo aparece tras confirmación. Un conflicto conserva el contenido local y exige una recarga explícita. La navegación y el cierre de sesión intentan guardar primero; el fallo mantiene la pantalla. Antes de cerrar o recargar el navegador se utiliza su aviso nativo para cambios pendientes.

Guardar una entidad y retirar su borrador son dos confirmaciones distintas. Work y Editorial conservan una finalización pendiente y permiten reintentar únicamente la limpieza, evitando crear un duplicado conocido. Los campos se bloquean durante el envío. No se promete entrega exactamente una vez ante pérdida de conexión anterior a conocer el resultado del comando; los RPC existentes mantienen sus contratos de idempotencia.

Las pruebas cambian pestaña y contexto de ventana y registran blur/focus reales, renuevan Auth, recargan, vuelven atrás, fuerzan offline, reintentan, provocan conflicto y cambian de usuario. Chrome automatizado conserva `visibilityState=visible`; no se afirma haber medido una transición hidden. La prueba explícita TOKEN_REFRESHED cubre por separado la causa del desmontaje.

No se añade contenido privado a localStorage, IndexedDB ni caché del service worker. Las credenciales de sesión existentes de Supabase no son borradores. Las suites PWA comprueban que peticiones privadas eviten la caché estática.

Mensajes conserva su clave idempotente dentro del borrador privado del servidor y confirma ese borrador antes del envío. Una respuesta autoritativa limpia la entrada local. Si falla la retirada del borrador y luego se recarga, reenviar reutiliza la misma clave: la prueba de navegador obtuvo el mismo ID y una sola entrada en el historial. Los borradores antiguos sin esa clave siguen siendo compatibles.
