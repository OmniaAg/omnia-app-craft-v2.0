# Decisión de navegación

Se conserva la navegación superior que el usuario valora en Portal y se aplica el mismo patrón a Internal. Una barra lateral permanente daría más espacio a etiquetas, pero ocuparía ancho útil en tablas, calendario y editor de trabajo y alteraría el modelo del Portal. La cabecera agrupada resuelve la saturación conservando esa identidad.

Los destinos principales son enlaces nativos. Los grupos usan botones de apertura con `aria-expanded`; Escape restaura el foco al disparador. ArrowDown entra al grupo; clic externo lo cierra. En menos de 64 rem, «Menú» abre los mismos grupos. El contenido no depende de desplazamiento horizontal del menú.

El coste deliberado es un clic adicional para destinos secundarios. La agrupación reduce elecciones simultáneas, pero no prueba que una persona descubra antes cada función. Los accesos de proyecto, dashboard y notificaciones conservan recorridos directos. Las mediciones comparables están en [VISUAL_QA_REPORT.md](VISUAL_QA_REPORT.md).

CRAFT no se parte ni se comprime. La indicación de notificaciones permanece en Más. El foco de ruta se mueve al encabezado; el enlace para saltar al contenido se conserva en ambas superficies.
