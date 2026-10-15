# OMNIA CRAFT — UX/UI EXPERIENCE REFACTOR REPORT

## 1. Executive Summary

**PASS local.** Se revisaron 45 entradas del router, 97 componentes funcionales y 465 controles declarados. No queda una pantalla o componente accesible sin revisar dentro de la aplicación local. La matriz distingue cambios, conservación, pruebas de navegador y pruebas de API/SQL.

Se corrigieron navegación saturada, pérdida al renovar sesión, recuperación de borradores, fallos de finalización, capas del dashboard, permisos CRM, documentos no emitibles, pestañas cortadas y contención de mensajes. Developer conserva identidad propia con autoridad equivalente a Dirección. [Auditoría completa](UX_AUDIT.md).

## 2. Laws of UX

| Principle | Original Problem | Implemented Solution | Evidence |
|---|---|---|---|
| Jakob | Modelos de navegación distintos | Patrón superior compartido | Router/teclado |
| Fitts | Controles superpuestos | Objetivos adecuados y capas corregidas | Dashboard/confirmación visual |
| Miller | Destinos sin agrupación | Grupos semánticos sin límites arbitrarios | Arquitectura de información |
| Hick | Decisiones simultáneas | Acciones secundarias en contexto | Personalización y builder |
| Postel | Validación frágil | IDs compatibles y reintento con entradas conservadas | Unit/Playwright |
| Peak–End | Pérdida al salir o terminar | Recuperación y limpieza confirmada | Persistencia/cleanup |
| Aesthetic–Usability | Riesgo de rebranding superficial | Identidad existente con comportamiento comprobado | Galería |
| Von Restorff | Competencia entre controles y trabajo | Atención primero, edición explícita | Dashboard |
| Tesler | UUID manual y secuencias difíciles | Selectores, concepto atómico y editor guiado | Billing/workflow |
| Doherty | Incertidumbre durante solicitudes | Feedback pending inmediato, confirmación real | Formularios y errores |

El PDF no estaba disponible; se aplicó el fallback autorizado a los principios del prompt. No se verificó directamente el libro. [Aplicación detallada](UX_LAWS_APPLICATION.md).

## 3. Navigation

Se eligió navegación superior agrupada para conservar el modelo valorado del Portal y el ancho útil de las pantallas de operación. Internal: Inicio, Trabajo, Clientes, Contenido, Gestión, Más. Portal: Resumen, Proyectos, Aprobaciones, Mensajes, Más. En móvil se despliegan los mismos grupos mediante Menú. Todas las rutas y accesos contextuales continúan disponibles según autoridad.

A 1440 px la cabecera de Dirección pasó de 960/2004 px disponibles/contenido a 613/613. Los destinos secundarios cuestan un clic adicional; se documenta ese intercambio y no se inventan tiempos de descubrimiento. [Decisión](NAVIGATION_DECISION.md), [arquitectura](INFORMATION_ARCHITECTURE.md).

## 4. Dashboard

Prioridades del equipo desde Analytics y resumen personal autorizado, con medidores y denominadores explícitos. Cuatro widgets por defecto; los ocho tipos y los layouts guardados se conservan. La separación normal/personalización ya existía. Se mejoraron jerarquía, capas, reintento y resolución del conflicto; no se atribuye como nueva esa separación. [Detalle](DASHBOARD_REDESIGN.md).

## 5. Forms & Actions

Se conservan los campos esenciales y comandos de dominio. Los formularios bloquean cambios durante el envío, anuncian fallos y mantienen entradas. CRM respeta capacidades Agency/Organization; GUID válidos no se rechazan por versión RFC. Project, Work y Editorial esperan la retirada del borrador después de guardar y evitan repetir una creación conocida. Billing selecciona organización/proyecto y registra pagos mediante formulario; crear documento incluye un concepto consistente de forma atómica.

No se ocultan eliminaciones ni se eliminan módulos para simular simplicidad. Historial, filtros, paginación y estados vacíos permanecen. [Matriz por componente](COVERAGE_MATRIX.md).

## 6. Visual Workflow Builder

Disparador, condiciones y acciones ordenadas conectadas, con preview y estados incompleto/configurado/deshabilitado. Botones permiten reordenar sin arrastre. Se respetan los límites de cinco condiciones/cinco acciones y la selección de conexiones activas del proyecto. Guardar, ejecutar, habilitar, historial, pasos y reintento usan el motor existente. [Editor](WORKFLOW_BUILDER.md).

## 7. Persistence

La causa reproducida era el cambio a loading de AuthProvider para el mismo actor, desmontando AuthGate. Se verificó regresión roja/verde y conservación en Chrome. Borradores privados del servidor cubren Project, Work, Editorial, Automation y Message, con validación, expiración, CAS monotónico y descarte explícito.

Los 33 checks incluyen foco real, refresh Auth/página, vuelta atrás, offline/reintento, conflicto de dos pestañas, formato incompatible, logout y cambio de usuario. Chrome automatizado mantuvo visibilityState visible: la prueba no afirma una transición hidden. Mensajes conserva la clave idempotente privada para que recargar tras un fallo de limpieza no duplique un envío confirmado. [Estrategia y límites](PERSISTENCE_STRATEGY.md).

## 8. Developer Role

Boss corresponde a agency_director. Developer es developer, normalizado a la autoridad canónica en funciones y en la política directa de etapas. Su identidad se conserva en registros. 23 checks Auth reales y 850 aserciones SQL comprueban paridad, ámbitos, aislamiento, suspensión y rechazos. Los clientes mantienen sus roles y asignaciones: Client Admin no recibe automáticamente decisiones de reviewer. [Matriz de autoridad](DEVELOPER_ROLE_SECURITY.md).

## 9. Design System

Se mantienen paleta OMNIA, Lexend/Quicksand, superficies internas dark y Portal azul claro. Navegación y estados de borrador son compartidos. Los tabs CRM refluyen completos y muestran selección; checkboxes conservan tamaño nativo con etiqueta activa; Mensajes mantiene compositor dentro de la superficie. Dirección «Control sereno»: ENERGY 1 / RHYTHM 2 / MOTION 1. No se añadieron dependencias.

Las advertencias mecánicas sobre colores/radios heredados se contrastaron con la identidad fijada. Los conectores indican orden y los estados de error/atención tienen propósito. [Delivery Gate](VERIFICATION.md).

## 10. Visual QA

2091 observaciones del router, 255 aperturas de tabs/paneles, 0 overflow y 0 errores JS. 234 observaciones principales y 364 secundarias; nueve tamaños entre 320 y 1920 px. Confirmación adicional de 36 estados tras los ajustes finales de CSS. Se inspeccionó la galería y se conservó el historial, señalando las capturas sustituidas. [Informe visual](VISUAL_QA_REPORT.md), [galería](review/gallery.html).

Accesibilidad: 13 checks, foco/teclado, errores, movimiento reducido, zoom Chrome real al 200 %, standalone y 0 hallazgos computados de contraste/tamaño en la muestra. No se presenta como certificación universal ni prueba en dispositivos físicos.

## 11. UX Measurements

| Medida | Antes | Después |
|---|---|---|
| Cabecera Dirección 1440 px | 960 px / 2004 px de contenido | 613 / 613 px |
| Widgets iniciales en código | Hasta 8 según capacidades | 4, biblioteca conservada |
| Formulario tras TOKEN_REFRESHED | Perdía entrada en reproducción | Conserva entrada |
| Recuperación de borrador | Sin esta recuperación privada | Confirmación, reintento, conflicto y aislamiento |
| Selección de cliente en Billing | UUID manual | Búsqueda y selector autorizado |

No se comparan tiempos humanos ni scroll vertical de datasets distintos. Los grupos secundarios requieren dos activaciones en escritorio y tres desde el menú móvil cerrado; los accesos contextuales siguen siendo directos.

Entrada JS actual: 538118 bytes, gzip 156335; referencia histórica Phase 15: 534537/155101. Diferencia 0.67 %/0.80 %, con el mismo cálculo gzip. Grid y builder siguen separados. Permanece el aviso de Vite por entrada superior a 500 kB; no se atribuye una mejora de rendimiento no medida. [Bundle](verification/bundle.json).

## 12. Verification

17 suites SQL / 850 aserciones; 23 checks de autorización real; 109 unit tests / 21 archivos; typecheck, lint, build y DB lint/tipos correctos. 14 grupos de regresión, incluidos 5 suites del grupo preparado, todos correctos. Browser: 26 checks principales, 69 secundarios, 33 persistencia, 5 correo/Auth y 13 accesibilidad. Secret scan local real sin hallazgos. [Comandos y logs](VERIFICATION.md).

Durante el trabajo un agregador histórico reinició por error la fuente local. Se restauró el backup completo, se verificaron recuentos y se preservó la base reemplazada. Las ejecuciones posteriores usaron reconstrucción aislada y runners sin reset. [Registro y restauración](WORK_LOG.md), [evidencia](verification/restoration.json).

## 13. Files Changed

[Listado de archivos, propósito e impacto](CHANGED_FILES.md). Tres migraciones nuevas: rol Developer, borradores privados y creación atómica de borrador Billing. Los originales se conservan. Los scripts nuevos producen inventario, matriz y evidencia reproducible; los fixtures heredados se hicieron repetibles sin relajar aserciones. Los artefactos históricos de fases previas se preservan y la evidencia nueva queda en ux-refactor.

## 14. Remaining Issues

Permanece el aviso de tamaño de la entrada JS descrito arriba. No queda un hallazgo funcional o visual abierto dentro de la cobertura local. Las limitaciones de validación son PDF no disponible, ausencia de usuarios participantes y dispositivos/navegadores físicos no ejecutados. El paquete Phase 17 anterior está desactualizado respecto a estos cambios.

## 15. Final Status

**PASS**, para el refactor y la cobertura local documentados. 45 entradas del router y 97 componentes funcionales auditados; 0 sin revisar. [Matriz completa](COVERAGE_MATRIX.md), [registro de 465 controles](CONTROL_LEDGER.md).

## 16. Deployment Readiness

**READY_FOR_RELEASE_PREPARATION**. Debe regenerarse el paquete Phase 17 con el nuevo build, tipos y las tres migraciones antes de preparar un despliegue manual. No se ha regenerado ni desplegado ese paquete. No se conectó Supabase Cloud, no se ejecutaron migraciones remotas, no se modificaron DNS/Cloudflare y no se hizo commit. Este PASS no autoriza por sí mismo un despliegue.
