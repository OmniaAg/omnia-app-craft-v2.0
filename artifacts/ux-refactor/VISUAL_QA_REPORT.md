# Verificación visual

Estado local: **PASS**. El recorrido completo produjo 2091 observaciones y 255 aperturas de pestañas/paneles, con 0 desbordamientos de documento/cabecera y 0 errores JavaScript. La cobertura funcional se acredita por separado en la matriz.

## Superficies y tamaños

Internal: Dirección, Developer, Project Manager y Contributor. Portal: Client Admin, Client Reviewer y Client Viewer. Se revisó también el acceso anónimo. Tamaños: 320×568, 375×667, 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900 y 1920×1080.

| Rol | Observaciones del recorrido |
|---|---|
| anonymous | 63 |
| director | 435 |
| developer | 445 |
| pm | 443 |
| contributor | 336 |
| adminA | 135 |
| reviewerA | 117 |
| viewerA | 117 |

234 estados de formularios del recorrido principal y 364 observaciones de controles secundarios complementan la apertura del router. Las variantes de componentes compartidos se revisan por comportamiento, alcance y estado; no se presenta cada valor posible de un input como una pantalla nueva.

## Hallazgos y confirmación

La revisión visual en conjunto identificó pestañas CRM cortadas, estilos de checkbox sobrescritos y el compositor de Mensajes fuera de la superficie al abrir miembros. Se corrigieron en CSS compartido. La confirmación final contiene 36 observaciones de geometría de tabs y conversación, además de nueve medidas del checklist. Todas cumplen el ancho y la contención esperados.

Capturas de referencia finales: [tabs móvil](verification/crm-complete-tabs-375.png), [mensajes móvil](verification/message-composer-open-375.png), [mensajes escritorio](verification/message-composer-open-1440.png), [responsables](verification/work-choices-375.png). La galería conserva 278 capturas de todos los recorridos y señala qué imágenes anteriores fueron sustituidas por la confirmación CSS: [galería](review/gallery.html). El registro de inspección está en [visual-review.json](review/visual-review.json).

## Accesibilidad

13 comprobaciones de interacción: enlace de salto, teclado, foco visible, contraseña visible/oculta, errores de validación, movimiento reducido, zoom real al 200 % y ventana Chrome con display-mode standalone. El muestreo computado registró 0 contrastes inferiores al umbral probado y 0 controles medidos de menos de 24 px. Los checkboxes usan etiqueta activa de 44 px, no un cuadrado artificial de 44 px.

El zoom usa preferencias reales de Chrome: devicePixelRatio≈2, ancho de contenido≈711 px y visualViewport.scale=1; no es escalado CSS. Las tablas conservan desplazamiento local cuando su información lo requiere. Las pestañas CRM y la navegación principal muestran etiquetas completas.

No se ejecutaron pruebas con lectores de pantalla físicos, Safari/iOS ni dispositivos nativos. El PASS describe el entorno local Chrome automatizado y la inspección visual registrada, sin certificar conformidad universal ni resultados de investigación con personas.

## Antes/después comparable

Cabecera Internal de Dirección a 1440 px: antes, 960 px disponibles y 2004 px de contenido; después, 613/613 px. El grupo superior ya no necesita scroll horizontal. La muestra inicial tuvo 170 observaciones con overflow de 295; la final es mayor y no se convierte esa diferencia en un porcentaje de mejora experimental.
