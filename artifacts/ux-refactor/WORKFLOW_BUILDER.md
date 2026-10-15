# Editor visual de workflows

Modelo: un disparador manual o un evento de dominio, hasta cinco condiciones conjuntivas y entre una y cinco acciones ordenadas. Son los límites del motor existente. El editor no añade ejecución arbitraria ni un grafo distinto al modelo persistido.

Las tarjetas muestran Disparador → Condiciones → Acción. Los conectores indican orden; son formas CSS, no controles. Cada acción permite subir, bajar o quitar; la última no se puede eliminar. Las condiciones permiten igualdad, contenido y existencia. Los campos requeridos dependen del operador. Los envíos sólo permiten conexiones activas aprobadas del proyecto.

La vista previa utiliza los mismos valores que se guardan. Los estados Incompleto, Configurado y Deshabilitado distinguen validez y habilitación. Cambiar a manual omite evento y condiciones en el payload canónico; no cambia la semántica del motor.

Se conservan configurar, habilitar/deshabilitar, ejecutar, historial paginado, pasos, intentos, límites de reintento y errores seguros. Los borradores usan el mismo mecanismo privado de recuperación. Tras guardar una definición nueva, continuar editando actualiza su ID confirmado.

Pruebas: editor con cinco condiciones/cinco acciones, orden, tipos, vista previa incompleta, restauración y descarte; guardado real, habilitación, ejecución y detalle; regresiones del motor e integraciones firmadas locales. Evidencia en `functional`, `secondary` y `verification`.
