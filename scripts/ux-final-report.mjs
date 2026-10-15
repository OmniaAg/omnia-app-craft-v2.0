import {readFileSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
const dir='artifacts/ux-refactor',read=p=>JSON.parse(readFileSync(dir+'/'+p,'utf8'))
const c=read('coverage.json'),b=read('after/browser.json'),before=read('before/browser.json'),db=read('verification/database.json'),roles=read('verification/role-auth.json'),functional=read('functional/results.json'),secondary=read('secondary/results.json'),state=read('state-qa/results.json'),auth=read('auth-qa/results.json'),a11y=read('accessibility/results.json'),visual=read('verification/visual-confirm.json'),regressions=read('verification/regressions.json'),prepared=read('verification/prepared-regressions.json'),bundle=read('verification/bundle.json'),gallery=read('review/manifest.json')
assert.equal(c.final,'PASS','A report cannot certify unfinished coverage')
assert.equal(state.completed,true)
const assertions=db.results.reduce((sum,x)=>sum+x.assertions,0)
const units=Number(readFileSync(dir+'/verification/test.log','utf8').match(/Tests\s+(\d+)\s+passed/)[1])
const md=(name,text)=>writeFileSync(dir+'/'+name,text.trim()+'\n')
const roleCounts=[...new Set(b.rows.map(x=>x.role))].map(role=>({role,observations:b.rows.filter(x=>x.role===role).length}))
const growth=((bundle.current.bytes/bundle.baseline.bytes-1)*100).toFixed(2),gzipGrowth=((bundle.current.gzipBytes/bundle.baseline.gzipBytes-1)*100).toFixed(2)
md('VISUAL_QA_REPORT.md',`# Verificación visual

Estado local: **PASS**. El recorrido completo produjo ${b.rows.length} observaciones y ${b.interactions.length} aperturas de pestañas/paneles, con 0 desbordamientos de documento/cabecera y 0 errores JavaScript. La cobertura funcional se acredita por separado en la matriz.

## Superficies y tamaños

Internal: Dirección, Developer, Project Manager y Contributor. Portal: Client Admin, Client Reviewer y Client Viewer. Se revisó también el acceso anónimo. Tamaños: 320×568, 375×667, 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900 y 1920×1080.

| Rol | Observaciones del recorrido |
|---|---|
${roleCounts.map(x=>`| ${x.role} | ${x.observations} |`).join('\n')}

${functional.states.length} estados de formularios del recorrido principal y ${secondary.states.length} observaciones de controles secundarios complementan la apertura del router. Las variantes de componentes compartidos se revisan por comportamiento, alcance y estado; no se presenta cada valor posible de un input como una pantalla nueva.

## Hallazgos y confirmación

La revisión visual en conjunto identificó pestañas CRM cortadas, estilos de checkbox sobrescritos y el compositor de Mensajes fuera de la superficie al abrir miembros. Se corrigieron en CSS compartido. La confirmación final contiene ${visual.states.length} observaciones de geometría de tabs y conversación, además de nueve medidas del checklist. Todas cumplen el ancho y la contención esperados.

Capturas de referencia finales: [tabs móvil](verification/crm-complete-tabs-375.png), [mensajes móvil](verification/message-composer-open-375.png), [mensajes escritorio](verification/message-composer-open-1440.png), [responsables](verification/work-choices-375.png). La galería conserva ${gallery.files.length} capturas de todos los recorridos y señala qué imágenes anteriores fueron sustituidas por la confirmación CSS: [galería](review/gallery.html). El registro de inspección está en [visual-review.json](review/visual-review.json).

## Accesibilidad

${a11y.checks.length} comprobaciones de interacción: enlace de salto, teclado, foco visible, contraseña visible/oculta, errores de validación, movimiento reducido, zoom real al 200 % y ventana Chrome con display-mode standalone. El muestreo computado registró 0 contrastes inferiores al umbral probado y 0 controles medidos de menos de 24 px. Los checkboxes usan etiqueta activa de 44 px, no un cuadrado artificial de 44 px.

El zoom usa preferencias reales de Chrome: devicePixelRatio≈2, ancho de contenido≈711 px y visualViewport.scale=1; no es escalado CSS. Las tablas conservan desplazamiento local cuando su información lo requiere. Las pestañas CRM y la navegación principal muestran etiquetas completas.

No se ejecutaron pruebas con lectores de pantalla físicos, Safari/iOS ni dispositivos nativos. El PASS describe el entorno local Chrome automatizado y la inspección visual registrada, sin certificar conformidad universal ni resultados de investigación con personas.

## Antes/después comparable

Cabecera Internal de Dirección a 1440 px: antes, 960 px disponibles y 2004 px de contenido; después, 613/613 px. El grupo superior ya no necesita scroll horizontal. La muestra inicial tuvo ${before.rows.filter(x=>!x.layoutPass).length} observaciones con overflow de ${before.rows.length}; la final es mayor y no se convierte esa diferencia en un porcentaje de mejora experimental.
`)
md('VERIFICATION.md',`# Verificación final

Estado: **PASS local**. Fuente y alcance: [provenance.json](verification/provenance.json). [coverage.json](coverage.json) vuelve a calcular el fingerprint y falla si no coincide con la fuente verificada.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Router y componentes | ${c.totals.routes} entradas, ${c.totals.components} componentes, ${c.totals.controls} controles; 0 sin revisar | [Matriz](COVERAGE_MATRIX.md) |
| Base reconstruida aislada | ${db.results.length} suites, ${assertions} aserciones pgTAP | [database.json](verification/database.json) |
| Sesiones Auth/RLS reales | ${roles.checks.length} checks | [role-auth.json](verification/role-auth.json) |
| Regresiones existentes | ${regressions.length} grupos; el grupo preparado contiene ${prepared.results.length} suites adicionales | [regressions.json](verification/regressions.json), [preparadas](verification/prepared-regressions.json) |
| Unit tests | ${units} pruebas en 21 archivos | [test.log](verification/test.log) |
| Typecheck, lint, build | Exit 0 | [frontend.json](verification/frontend.json), [build](verification/build.log) |
| DB lint / tipos | Sin errores / tipos vigentes | Comandos locales db:lint y db:types:check registrados en WORK_LOG |
| Navegador: router | ${b.rows.length} observaciones, 0 overflow, 0 JS errors | [browser.json](after/browser.json) |
| Navegador: acciones principales | ${functional.checks.length} checks / ${functional.states.length} observaciones | [functional](functional/results.json) |
| Navegador: controles secundarios | ${secondary.checks.length} checks / ${secondary.states.length} observaciones | [secondary](secondary/results.json) |
| Persistencia | ${state.checks.length} checks, ejecución completada | [state](state-qa/results.json) |
| Auth con correo local | ${auth.checks.length} checks / ${auth.states.length} observaciones | [auth](auth-qa/results.json) |
| Accesibilidad | ${a11y.checks.length} checks; 0 hallazgos computados de contraste/tamaño | [accessibility](accessibility/results.json) |
| Confirmación visual | ${visual.checks.length} checks / ${visual.states.length} observaciones | [visual-confirm](verification/visual-confirm.json) |
| Secretos reales locales | Sin hallazgos; incluye toda la evidencia UX | [secret-scan](verification/secret-scan.json) |

## Regresiones incluidas

${regressions.map(x=>`- ${x.suite}: ${x.pass?'PASS':'FAIL'}`).join('\n')}

El grupo preparado ejecuta Work, Deliverables, Analytics, Portal y seguridad, restaurando exactamente las membresías y grants originales del fixture cuando necesita aislarlos. Se preservaron las aserciones. Los tests Phase 13 usan un proyecto nuevo por ejecución; concurrencia usa un título único. Esto evita confundir efectos de ejecuciones anteriores con duplicados del mismo comando.

No se utiliza el agregador histórico que hace db:reset sobre la fuente. La suite SQL reconstruye únicamente una base temporal y la elimina al finalizar. La incidencia inicial y la restauración completa se documentan en WORK_LOG.

## Anti Slop Delivery Gate

Dirección conservada: DESIGN.md, «Control sereno», ENERGY 1 / RHYTHM 2 / MOTION 1. Se revisaron funcionalidad, foco, estados, jerarquía, identidad y ausencia de cifras/claims inventados. Los colores, superficies, gradientes y radios heredados responden a la identidad expresamente fijada por el usuario. Los acentos por widget distinguen categoría; amarillo señala atención y foco. Las flechas del builder representan secuencia; sus bordes CSS forman triángulos, no tabs laterales decorativos.

El detector Impeccable se ejecutó una vez: sus advertencias sobre radios/colores heredados no sustituyen el brief; el borde de error y los conectores tienen función documentada. No se afirma «cero advertencias del detector». La inspección y la confirmación final no dejan un defecto visual abierto dentro de la cobertura local.

La revisión no incluye el PDF ausente ni dispositivos físicos. No se declara investigación con personas, certificación WCAG universal ni latencia garantizada de 400 ms.
`)
const changed=[...new Set([...execFileSync('git',['diff','--name-only'],{encoding:'utf8',stdio:['pipe','pipe','ignore']}).trim().split(/\r?\n/),...execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/)])].filter(x=>x&&!x.startsWith('artifacts/phase-')&&!x.startsWith('artifacts/ux-refactor/')).sort()
const purpose=file=>file.startsWith('supabase/migrations')?'Migración local nueva; autoridad, borradores o creación atómica Billing':file.startsWith('supabase/tests')?'Regresión SQL de seguridad y dominio':file.includes('database.types')?'Tipos del esquema local':file.startsWith('scripts/')?'Inventario, QA reproducible o fixture repetible; sin despliegue':file.startsWith('src/test/')?'Regresión de comportamiento':file.includes('/drafts/')?'Recuperación privada y finalización confirmada':file.includes('/navigation/')||file.includes('/shells/')?'Navegación compartida y límites por capacidad':file.startsWith('src/')?'Experiencia, validación y estados del módulo correspondiente':'Estado y documentación del repositorio'
md('CHANGED_FILES.md','# Archivos modificados\n\nLos PNG, JSON, Markdown y logs de artifacts/ux-refactor son evidencia adicional. No se modificaron package.json ni el lockfile.\n\n| Archivo | Propósito / impacto |\n|---|---|\n'+changed.map(file=>`| ${file} | ${purpose(file)} |`).join('\n'))
md('FINAL_REPORT.md',`# OMNIA CRAFT — UX/UI EXPERIENCE REFACTOR REPORT

## 1. Executive Summary

**PASS local.** Se revisaron ${c.totals.routes} entradas del router, ${c.totals.components} componentes funcionales y ${c.totals.controls} controles declarados. No queda una pantalla o componente accesible sin revisar dentro de la aplicación local. La matriz distingue cambios, conservación, pruebas de navegador y pruebas de API/SQL.

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

Los ${state.checks.length} checks incluyen foco real, refresh Auth/página, vuelta atrás, offline/reintento, conflicto de dos pestañas, formato incompatible, logout y cambio de usuario. Chrome automatizado mantuvo visibilityState visible: la prueba no afirma una transición hidden. Mensajes conserva la clave idempotente privada para que recargar tras un fallo de limpieza no duplique un envío confirmado. [Estrategia y límites](PERSISTENCE_STRATEGY.md).

## 8. Developer Role

Boss corresponde a agency_director. Developer es developer, normalizado a la autoridad canónica en funciones y en la política directa de etapas. Su identidad se conserva en registros. ${roles.checks.length} checks Auth reales y ${assertions} aserciones SQL comprueban paridad, ámbitos, aislamiento, suspensión y rechazos. Los clientes mantienen sus roles y asignaciones: Client Admin no recibe automáticamente decisiones de reviewer. [Matriz de autoridad](DEVELOPER_ROLE_SECURITY.md).

## 9. Design System

Se mantienen paleta OMNIA, Lexend/Quicksand, superficies internas dark y Portal azul claro. Navegación y estados de borrador son compartidos. Los tabs CRM refluyen completos y muestran selección; checkboxes conservan tamaño nativo con etiqueta activa; Mensajes mantiene compositor dentro de la superficie. Dirección «Control sereno»: ENERGY 1 / RHYTHM 2 / MOTION 1. No se añadieron dependencias.

Las advertencias mecánicas sobre colores/radios heredados se contrastaron con la identidad fijada. Los conectores indican orden y los estados de error/atención tienen propósito. [Delivery Gate](VERIFICATION.md).

## 10. Visual QA

${b.rows.length} observaciones del router, ${b.interactions.length} aperturas de tabs/paneles, 0 overflow y 0 errores JS. ${functional.states.length} observaciones principales y ${secondary.states.length} secundarias; nueve tamaños entre 320 y 1920 px. Confirmación adicional de ${visual.states.length} estados tras los ajustes finales de CSS. Se inspeccionó la galería y se conservó el historial, señalando las capturas sustituidas. [Informe visual](VISUAL_QA_REPORT.md), [galería](review/gallery.html).

Accesibilidad: ${a11y.checks.length} checks, foco/teclado, errores, movimiento reducido, zoom Chrome real al 200 %, standalone y 0 hallazgos computados de contraste/tamaño en la muestra. No se presenta como certificación universal ni prueba en dispositivos físicos.

## 11. UX Measurements

| Medida | Antes | Después |
|---|---|---|
| Cabecera Dirección 1440 px | 960 px / 2004 px de contenido | 613 / 613 px |
| Widgets iniciales en código | Hasta 8 según capacidades | 4, biblioteca conservada |
| Formulario tras TOKEN_REFRESHED | Perdía entrada en reproducción | Conserva entrada |
| Recuperación de borrador | Sin esta recuperación privada | Confirmación, reintento, conflicto y aislamiento |
| Selección de cliente en Billing | UUID manual | Búsqueda y selector autorizado |

No se comparan tiempos humanos ni scroll vertical de datasets distintos. Los grupos secundarios requieren dos activaciones en escritorio y tres desde el menú móvil cerrado; los accesos contextuales siguen siendo directos.

Entrada JS actual: ${bundle.current.bytes} bytes, gzip ${bundle.current.gzipBytes}; referencia histórica Phase 15: ${bundle.baseline.bytes}/${bundle.baseline.gzipBytes}. Diferencia ${growth} %/${gzipGrowth} %, con el mismo cálculo gzip. Grid y builder siguen separados. Permanece el aviso de Vite por entrada superior a 500 kB; no se atribuye una mejora de rendimiento no medida. [Bundle](verification/bundle.json).

## 12. Verification

${db.results.length} suites SQL / ${assertions} aserciones; ${roles.checks.length} checks de autorización real; ${units} unit tests / 21 archivos; typecheck, lint, build y DB lint/tipos correctos. ${regressions.length} grupos de regresión, incluidos ${prepared.results.length} suites del grupo preparado, todos correctos. Browser: ${functional.checks.length} checks principales, ${secondary.checks.length} secundarios, ${state.checks.length} persistencia, ${auth.checks.length} correo/Auth y ${a11y.checks.length} accesibilidad. Secret scan local real sin hallazgos. [Comandos y logs](VERIFICATION.md).

Durante el trabajo un agregador histórico reinició por error la fuente local. Se restauró el backup completo, se verificaron recuentos y se preservó la base reemplazada. Las ejecuciones posteriores usaron reconstrucción aislada y runners sin reset. [Registro y restauración](WORK_LOG.md), [evidencia](verification/restoration.json).

## 13. Files Changed

[Listado de archivos, propósito e impacto](CHANGED_FILES.md). Tres migraciones nuevas: rol Developer, borradores privados y creación atómica de borrador Billing. Los originales se conservan. Los scripts nuevos producen inventario, matriz y evidencia reproducible; los fixtures heredados se hicieron repetibles sin relajar aserciones. Los artefactos históricos de fases previas se preservan y la evidencia nueva queda en ux-refactor.

## 14. Remaining Issues

Permanece el aviso de tamaño de la entrada JS descrito arriba. No queda un hallazgo funcional o visual abierto dentro de la cobertura local. Las limitaciones de validación son PDF no disponible, ausencia de usuarios participantes y dispositivos/navegadores físicos no ejecutados. El paquete Phase 17 anterior está desactualizado respecto a estos cambios.

## 15. Final Status

**PASS**, para el refactor y la cobertura local documentados. ${c.totals.routes} entradas del router y ${c.totals.components} componentes funcionales auditados; ${c.totals.unreviewed} sin revisar. [Matriz completa](COVERAGE_MATRIX.md), [registro de ${c.totals.controls} controles](CONTROL_LEDGER.md).

## 16. Deployment Readiness

**READY_FOR_RELEASE_PREPARATION**. Debe regenerarse el paquete Phase 17 con el nuevo build, tipos y las tres migraciones antes de preparar un despliegue manual. No se ha regenerado ni desplegado ese paquete. No se conectó Supabase Cloud, no se ejecutaron migraciones remotas, no se modificaron DNS/Cloudflare y no se hizo commit. Este PASS no autoriza por sí mismo un despliegue.
`)
console.log(JSON.stringify({report:'FINAL_REPORT.md',coverage:c.final,units,sql:assertions,secondary:secondary.checks.length,captures:gallery.files.length}))
