import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const root='artifacts/final-visual-qa'
const read=file=>JSON.parse(readFileSync(`${root}/${file}`,'utf8'))
const before=read('before/measurements.json'), after=read('after/measurements.json'), flows=read('flows/results.json')
const frontend=read('verification/frontend.json'), backend=read('verification/backend.json'), sql=read('verification/isolated-sql.json'), portal=read('verification/portal-prepared.json'), zoom=read('after/browser-zoom.json')
const navigation=read('after/navigation.json')
assert.ok(after.rows.every(row=>row.result==='PASS'))
assert.ok(after.interactions.every(row=>row.pass))
assert.ok(flows.checks.every(row=>row.pass)&&flows.forms.every(row=>row.pass)&&flows.contrast.every(row=>!row.findings.length))
assert.ok(frontend.every(row=>row.pass)&&sql.results.every(row=>row.pass)&&portal.pass)
assert.ok(navigation.checks.every(row=>row.pass||row.result==='NOT APPLICABLE')&&!navigation.errors.length)
assert.equal(after.errors.length+flows.errors.length,0)
assert.ok(after.http.every(row=>row.role==='anonymous'&&row.path==='/auth/v1/token'&&row.status===400))
const normalize=route=>route.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g,':id').replace(/workItem=:id/g,'workItem=:id')
const paths=[...new Set(after.rows.filter(row=>row.state==='default').map(row=>normalize(row.route)))]
const widths=[320,375,390,768,1366,1440,1920]
const matrix=paths.map(path=>`| ${path} | ${widths.map(width=>{
  const rows=after.rows.filter(row=>row.state==='default'&&normalize(row.route)===path&&row.width===width)
  return rows.length?(rows.every(row=>row.result==='PASS')?'PASS':'FAIL'):'NOT APPLICABLE'
}).join(' | ')} |`).join('\n')
const login=after.rows.filter(row=>row.route==='/login'&&row.state==='default').map(row=>{
  const initial=before.rows.find(old=>old.route==='/login'&&old.state==='default'&&old.width===row.width)
  return `| ${row.width} × ${row.height} | ${initial.scrollHeight} → ${row.scrollHeight} | ${initial.form.y.toFixed(1)} → ${row.form.y.toFixed(1)} | ${initial.cta.bottom.toFixed(1)} → ${row.cta.bottom.toFixed(1)} | ${row.height<568?'PASS, scroll intencional':'PASS, sin scroll'} |`
}).join('\n')
const changed=execFileSync('git',['diff','--name-only','--','src','index.html'],{encoding:'utf8'}).trim().split('\n')
const scripts=['final-visual-qa.mjs','final-visual-flows.mjs','final-visual-zoom.mjs','final-visual-navigation.mjs','verify-final-visual.mjs','final-visual-isolated-sql.mjs','final-visual-portal-regression.mjs','write-final-visual-report.mjs']
const screenshots=readdirSync(`${root}/after`).filter(name=>name.endsWith('.png')).length+readdirSync(`${root}/before`).filter(name=>name.endsWith('.png')).length+readdirSync(`${root}/flows`).filter(name=>name.endsWith('.png')).length
const assertions=sql.results.reduce((sum,row)=>sum+row.assertions,0)
const issueRows=[
 ['V01','Login móvil: marca con min-height de 19/22rem antes del formulario','375 × 667: CTA en 902.5px; documento 1006px','Cabecera compacta con logo de 44px; relato/señal sólo en composición amplia','Login sin scroll en los diez tamaños'],
 ['V02','Login laptop: padding de hasta 96px y titular de hasta 76px','1366 × 768: documento 841px','Padding fluido acotado y titular con escala existente; 100dvh','Documento 768px; CTA 585.3px'],
 ['V03','Billing: utilidades de Tailwind sin runtime de Tailwind','Tabla de 416px escapaba en móvil','CSS propio, tabla semántica y región de scroll enfocables; se conserva cada columna','Sin overflow global; acciones mediante scroll de tabla'],
 ['V04','Work: mínimos intrínsecos en forms, labels, fieldsets y date inputs','320px: editor de 313px sobre 288px disponibles','min-width:0 en los elementos que deben encoger; checklist con hit area de 44px','Formulario, texto largo y submit accesibles'],
 ['V05','CRM: pestañas Contacts/Opportunities expandían el grid','375px: ancho de documento 736px','min-width:0 en secciones del detalle; tabla mantiene su scroll','Grid no propaga el mínimo de la tabla'],
 ['V06','Analytics: select de proyecto con opciones largas','375px: 378px; tablet: 874px en viewport de 768px','Track minmax(0,1fr), select/input fluidos con mínimo cero','Sin overflow con Integration Project de fixtures reales'],
 ['V07','Reviews: superficies blancas heredaban texto claro del shell','Inspección de reviews.css y contraste del historial renderizado','Superficies, controles y metadata usan roles semánticos existentes','Versiones/revisores legibles; formularios medidos'],
 ['V08','Messages: heading oscuro sobre shell oscuro y composición desproporcionada','Capturas before de Messages y conversación','Texto exterior por tema; texto explícito en superficies blancas; historial flexible con scroll propio','Canal, historial, borrador, cambio de canal y submit accesibles'],
 ['V09','Notificaciones: contador dependía de CSS lazy y flotaba sobre el composer','Captura before de conversación e inspección de imports muestran el contador flotante y su CSS dependiente de ruta','Badge no interactivo dentro del enlace de navegación, CSS cargado con el componente','Sin overlay sobre textarea; un solo destino y realtime conservado'],
 ['V10','Menús: Escape no cerraba disclosure ni devolvía foco','Before: cuatro checks de Escape fallidos','Escape cierra y devuelve foco al trigger en ambos shells','Checks Director, PM, Contributor y Client pasan'],
 ['V11','Portal: novedades sin project_id enlazaban /portal/projects/null','Round 1: seis HTTP 400 derivados del enlace real','Fallback al listado de notificaciones y label Ver notificación','No hay enlaces null ni errores de red inesperados'],
 ['V12','Escala, foco, touch y viewport inconsistentes entre módulos','Titulares de hasta 60px; foco claro sobre blanco; targets pequeños','Escala font-size-2xl existente; foco según superficie; controles y enlaces principales de 44px; safe areas y interactive-widget','Formularios en 320/375/768/1366; teclado, zoom y contrastes verificados'],
]
writeFileSync(`${root}/issue-matrix.csv`,'issue,route_or_area,evidence,fix,result\n'+issueRows.map(row=>row.map(value=>'"'+value.replaceAll('"','""')+'"').join(',')).join('\n'))
writeFileSync(`${root}/visual-matrix.md`,'| Route | 320 | 375 | 390 | 768 | 1366 | 1440 | 1920 |\n|---|---|---|---|---|---|---|---|\n'+matrix+'\n')
const issueFor=route=>route==='/login'?'V01/V02':route.includes('/billing')?'V03':route.includes('workItem=')||route.includes('tab=work')?'V04':route.includes('/crm/accounts/')?'V05':route.includes('/analytics')?'V06':route.includes('/deliverables/')||route.includes('/reviews')?'V07':route.includes('/messages')?'V08/V09':route.includes('/notifications')?'V09/V11':'V10/V12'
writeFileSync(`${root}/route-viewport-matrix.csv`,'route,role,viewport,state,issue,fix,result\n'+after.rows.map(row=>[row.route,row.role,`${row.width}x${row.height}`,row.state,issueFor(row.route),'Consultar issue-matrix.csv',row.result].map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\n'))

const gate=[
 ['R-02','PASS','Copy añadida sin em dash; el título de este reporte reproduce el solicitado por el usuario.'],
 ['R-03','PASS',`${after.rows.length} mediciones finales sin escape horizontal ni controles recortados; forms y zoom con scroll accesible.`],
 ['R-17 / R-18','PASS','Métricas, personas y eventos proceden del backend local determinístico; no se añadieron claims ni testimonios.'],
 ['R-23','PASS','Logos y assets conservados; no se generaron nuevos assets de marca ni navegación.'],
 ['R-24','PASS','Rutas reales recorridas; fallback de novedades sin proyecto probado; aliases de push cubiertos por regresiones.'],
 ['R-25','PASS',`${flows.contrast.length} evaluaciones de contraste de texto sin fallos; pares de control/foco en contrast-checks.txt. Fondos atmosféricos se evalúan además por su límite de mezcla.`],
 ['R-26','PASS','Controles conservan handlers; clicks registrados en checks/forms; comandos de riesgo validados por suites de dominio y confirmación Billing descartada.'],
 ['R-27','PASS','Login vacío, validación, error y loading; recuperación success; forms vacíos/poblados y guardado Work real; datos vacíos/reales y estados de error en componentes existentes.'],
 ['R-28','PASS','No existe FAQ dentro de estas superficies ni se añadió una.'],
 ['R-32','PASS','Skip link, foco visible, Enter, Escape y retorno de foco; scroll de formularios y tabla Billing accesibles.'],
 ['R-33','PASS','Ediciones escritas en fuente con apply_patch; scripts sólo verifican o generan evidencia.'],
 ['R-34','PASS','Shell interno oscuro, Auth claro y Portal claro verificados; no hay toggle de tema publicado.'],
 ['R-35','PASS',`Build real, ${after.interactions.length} checks por rol, ${flows.checks.length} checks de flujos, 102 unit tests y regresiones de dominio. El alcance no equivale a activar cada comando destructivo de la aplicación.`],
 ['R-36 / R-38','PASS','No se añadieron afirmaciones comerciales, de seguridad o cumplimiento; fixtures de prueba documentados como locales.'],
 ['R-37','PASS','Dirección existente: Control sereno, Lexend/Quicksand y paleta OMNIA; refinamiento autorizado.'],
 ['R-01','PASS','Atmósfera de marca existente conservada; no hay gradientes nuevos.'],
 ['R-04','PASS','Sin iconos decorativos nuevos; iconos operativos existentes tienen controles con nombre.'],
 ['R-06','PASS','Lexend expresa títulos OMNIA y Quicksand cuerpo/controles; escala incumbente reutilizada.'],
 ['R-07','PASS','No se añadieron grillas o texturas de fondo.'],
 ['R-08','PASS','Flechas existentes indican regreso; ninguna flecha decorativa nueva.'],
 ['R-09','PASS','Badges comunican estados o unread real; no se añadieron claims sobre H1.'],
 ['R-10','PASS','Sin glassmorphism añadido; superficies operativas sólidas.'],
 ['R-12','PASS','Sombras existentes separan tarea/panel; Billing no incorpora elevación decorativa.'],
 ['R-13','PASS','Foco visible tiene propósito de navegación; sin glows nuevos.'],
 ['R-14','PASS','Se conservaron cards de contenido y widgets configurables; no se añadieron feature cards.'],
 ['R-19','PASS','Se retiró el loop decorativo Auth; transiciones existentes y pulso de carga tienen propósito; reduced motion respeta preferencias.'],
 ['R-22','PASS','Sin ilustraciones nuevas.'],
 ['Dials','PASS','ENERGY 1 / RHYTHM 1 / MOTION 2: operación serena, agrupaciones predecibles, transiciones discretas y feedback de carga.'],
 ['Dials consistency','PASS','La composición y las transiciones observadas mantienen esos valores; no se añadió una nueva dirección visual.'],
 ['Focal point','PASS','H1/contexto y acción principal por formulario; capturas Login, Work, Billing, Editorial e Integration.'],
 ['Whitespace','PASS','Espaciado diferencia campos, grupos y secciones; menor altura de marca móvil permite completar el acceso.'],
 ['Accent','PASS','Morado interno, azul Portal y foco contextual señalan contexto y acción.'],
 ['Identity motif','PASS','Logo, tipografía y separación interna/cliente conservan la identidad OMNIA.'],
 ['Design Read','PASS','Lectura operativa basada en DESIGN.md, declarada durante las correcciones; no se reemplazó el mundo visual.'],
 ['C-1','PASS','Razones de cambios registradas en V01–V12 y en la sección Design Consistency.'],
 ['C-2','PASS','Handlers y rutas operables; fallback de novedad sin proyecto corrige una acción rota.'],
 ['C-3','PASS','No hay nuevas secciones de relleno; paneles existentes sirven proyectos, trabajo, revisiones y datos.'],
 ['C-4','PASS','Viewports, roles, estados, foco y zoom ensayados; pruebas físicas fuera del alcance de esta validación local.'],
 ['C-5','PASS','Toda cifra del reporte proviene de artefactos locales; no se inventó evidencia.'],
 ['R-05','PASS','Se preservaron layouts operativos por contenido; no se introdujo una plantilla de landing.'],
 ['R-11','PASS','Radios existentes xs/sm/md y pills para status/navegación; no se uniformó todo como cápsula.'],
 ['R-15 / R-16','PASS','Copy nueva nombra la acción Ver notificación; sin CTAs genéricos ni buzzwords.'],
 ['R-20','PASS','Logos, tipografía, paleta y separación interna/cliente siguen siendo OMNIA Craft.'],
 ['R-21','PASS','Dark-first y Portal/Auth claros provienen de la dirección de marca existente.'],
 ['R-29','PASS','Sin nueva paleta; roles semánticos neutrales, contextuales y de estado existentes.'],
 ['R-30','PASS','Refinamiento de la aplicación existente; sin imitación ni sustitución de identidad.'],
 ['R-31','PASS','Cada decisión principal tiene motivo: cabida, legibilidad, scroll, foco o acciones alcanzables.'],
 ['Human supplement','PASS','Contraste calculado, labels en forms medidos, foco visible, estados con texto, zoom real y simulación de altura de teclado.'],
 ['Layoutmobile supplement','PASS','Grids se apilan, mínimos intrínsecos controlados, controles principales de 44px y menús operables; safe areas ensayadas según soporte CDP.'],
 ['UI supplement','PASS','Identidad conservada, sin decoración añadida; datos reales de fixtures, estados funcionales y escala coherente.'],
]
writeFileSync(`${root}/ANTI_SLOP_DELIVERY_GATE.md`,'# Anti Slop Delivery Gate\n\nAlcance: cambios y superficies verificadas en esta auditoría local; no es certificación WCAG ni una prueba física de iOS/Android.\n\n'+gate.flatMap(([id,status,evidence])=>id.split(' / ').map(rule=>`- ${rule} ${status}: ${evidence}`)).join('\n')+'\n')

const text=`# OMNIA CRAFT — FINAL VISUAL QA REPORT

Fecha: 2026-10-14, America/Mexico_City. Validación local de calidad final; no constituye una fase funcional nueva.

## 1. Executive Summary

- **Final Visual Status: PASS** para el alcance automatizado local documentado.
- ${paths.length} rutas/estados normalizados en matriz, ${after.rows.length} mediciones finales, cuatro roles: Director, PM scoped, Contributor y Client admin A.
- Diez tamaños solicitados y landscape 844 × 390. Director/Client cubren toda la matriz; PM/Contributor añaden 375 × 667, 768 × 1024 y 1366 × 768.
- 12 grupos de defectos corregidos. Cero defectos bloqueantes visuales abiertos en la verificación final. Round 1 conserva hallazgos y regresiones intermedias, no se ocultaron fallos.
- Quedan validaciones físicas de teclado, barras dinámicas y PWA/Web Push en iOS/Android para preparación de lanzamiento. La simulación local no demuestra comportamiento del SO.
- Sin deployment, commit, librerías nuevas, migraciones, cambios de RLS o lógica financiera. No se implementó Phase 17.

## 2. Login

La marca móvil imponía 19rem/22rem de altura antes del formulario. El panel añadía 48px de padding superior, márgenes grandes y encabezados de hasta 76px. En laptop el padding lateral/vertical de hasta 96px, el tamaño del heading y la suma de contenido/footer expandían el grid por encima del viewport.

Se conserva la composición de dos columnas en ancho suficiente. En móvil el logo pasa a una cabecera de 44px y el relato/señal no esencial se reserva para desktop. Se reutiliza la escala tipográfica; se acotan padding/gaps, se usa 100dvh y safe areas. En alturas cortas se reducen espacios y los campos conservan 44px. Nunca se ocultan controles para simular cabida. El body ya no suprime overflow horizontal.

| Viewport | document scrollHeight before → after | form top before → after | CTA bottom before → after | Resultado |
|---|---|---|---|---|
${login}

El formulario, logo, heading, email, password, botón y recuperación están disponibles. En landscape bajo, zoom real 200% y altura reducida, el scroll vertical es intencional y permite alcanzar inputs/submit. Los bounds completos (x/y/width/height/bottom/right) están en measurements.json.

## 3. Internal App

Revisados Dashboard, My Space, Organizations y todas las pestañas de detalle (Brands, Contacts, Opportunities, Activity), CRM, Projects, Project Detail, Work y panel de detalle, Editorial global/de proyecto, Reviews/configuración/historial de Deliverables, Content Manager, Messages/canales, Notifications, Billing, Analytics, Automations, Integrations, AI Assistant y Settings/Push.

Se corrigieron grids intrínsecos en Work/CRM, selects largos en Analytics, estilos y tabla Billing, legibilidad de Reviews/Messages y espaciado/tamaño de headings. Menús disclosure se abren con Enter y cierran con Escape, devolviendo foco. El contador de notificaciones tiene CSS propio y vive en navegación, sin cubrir texto ni acciones. Contributor no ve creación de Billing/workflows; los estados sin capability continúan visibles y controlados por backend.

Scroll: el documento es el contenedor vertical de páginas largas. Tablas/tabs usan scroll horizontal local; dashboard widgets e historial de mensajes tienen scroll interno funcional. No hay nueva jerarquía de scroll global. No hay modales custom en el router auditado; editores son inline y confirm/prompt financieros son nativos. La confirmación Billing se abrió y descartó sin emitir documentos.

## 4. Client Portal

Revisados Resumen, Projects/detail, Deliverables publicados, Approvals, Documents (incluida proyección Billing), Messages/canales, Notifications, Reports y Settings/Push. El Portal conserva el azul y las superficies claras. Sus roles semánticos de controles evitan heredar superficies oscuras del shell interno. Los headings reciben foco al navegar; enlaces principales tienen hit area de 44px.

Novedades sin project_id ahora abren Notificaciones con una etiqueta coherente; desaparece /portal/projects/null y sus HTTP 400. Navegación, conversación, regreso a canales, texto y formulario de feedback se midieron. No se amplió autorización ni se modificaron datos consultados.

## 5. Design Consistency

- **Typography:** Lexend en títulos y Quicksand en cuerpo; se reutiliza font-size-2xl para contexto operativo, sin introducir una escala nueva.
- **Spacing:** tokens existentes agrupan labels/inputs y separan secciones; Auth adapta densidad según altura disponible.
- **Buttons/inputs:** acciones principales con targets de 44px, texto móvil de 16px y foco según la superficie; bordes de control verificados por cálculo.
- **Cards:** Reviews adopta roles del tema; no se añaden cards ni sombras decorativas. Billing usa una sección inline y tabla plana.
- **Modals:** NOT APPLICABLE para diálogos custom; se conserva la UI nativa de confirm/prompt de Billing.
- **Tables/tabs:** todas las columnas se preservan, con scroll local. Billing tiene región enfocables y nombre accesible; CRM/Analytics no propagan min-content al documento.
- **Motion:** se retira el loop decorativo Auth. Transiciones existentes y carga tienen propósito; reduced motion es respetado.

Lectura visual: aplicación operativa para el equipo OMNIA y organizaciones cliente, lenguaje Control sereno, ENERGY 1 / RHYTHM 1 / MOTION 2. Motivo de cada cambio: mantener cabida, legibilidad, jerarquía, foco y acceso a acciones dentro de la identidad existente.

| ID | Defecto | Evidencia | Corrección | Resultado |
|---|---|---|---|---|
${issueRows.map(row=>'| '+row.join(' | ')+' |').join('\n')}

## 6. Visual Test Matrix

PASS significa que el documento no desborda horizontalmente, los elementos visibles no escapan fuera de un scroll intencional y los controles no están recortados por contenedores. Login añade cabida sin scroll cuando altura ≥568px. No significa que una página operativa larga deba caber completa. PM/Contributor complementan permisos/estados; no se extrapola su cobertura a tamaños no ejecutados.

| Route | 320 | 375 | 390 | 768 | 1366 | 1440 | 1920 |
|---|---|---|---|---|---|---|---|
${matrix}

Routing adicional: / redirige por contexto tras login; wildcard se prueba con /missing-visual-qa. /app/push/:notificationId y /portal/push/:notificationId son resolutores, cubiertos por PWA/Push y pruebas de destinos, no pantallas nuevas. Se conservan y no se omiten del inventario. Reset/accept-invite se revisan sin token (estado de enlace inválido); aceptación/recuperación real y auth errors están además en regresión Auth.

Los tamaños adicionales 360 × 740, 430 × 932, 1024 × 768 y landscape 844 × 390 están en el JSON, igual que teclado simulado a 375 × 360, reduced motion y standalone. Brands, Files y Work son pestañas/contextos reales, no rutas independientes inventadas.

## 7. Accessibility

- Keyboard: skip link a email, foco visible, Enter para menú y Escape con retorno al trigger; cuatro roles.
- Labels: ${flows.forms.length} mediciones de forms verifican labels, bounds de controles y acción submit alcanzable. Se incluyen Projects, Work, Deliverables, Editorial, Billing, Automation Builder, Integration secret y feedback cliente cuando está disponible.
- Estados: vacío, validación, long text, Login pending/error, recuperación success y Work success mediante guardado local real. Éxitos/transiciones de Billing, Files, Messages y Approvals están cubiertos por sus suites reales; no se crearon conexiones externas para simular éxito de Integration.
- Zoom: chrome.tabs.setZoom(2), valor real confirmado, ${zoom.length} rutas verificadas. Viewport CSS medido, sin overflow; Auth permite scroll y submit sigue alcanzable. No se sustituyó por CSS zoom ni pinch zoom.
- Touch: controles y enlaces principales con 44px; checkboxes conservan su visual pequeño dentro de labels accionables. Enlaces de texto inline no se equiparan a botones.
- Reduced motion: media reduce ejecutada y CSS revisado; no se añadió animación.
- Contraste: ${flows.contrast.length} evaluaciones de pantallas/estados con texto calculado; resultados completos en flows/results.json. Pares de control/foco y peor caso de las atmósferas de fondo en contrast-checks.txt. Esto no sustituye una certificación integral WCAG ni una revisión con lector de pantalla físico.
- PWA/safe areas: production SW real activo; rama standalone por navigator.standalone, insets CDP donde soportado y viewport-fit=cover. interactive-widget=resizes-content deja que Chromium ajuste altura al teclado. Teclado físico, Safari/iOS standalone y entrega Push nativa quedan pendientes de ensayo de dispositivos.

## 8. Verification

| Gate | Resultado | Evidencia |
|---|---|---|
${frontend.map(row=>`| ${row.command} | PASS | verification/${row.command.slice(8).replaceAll(':','-')}.log |`).join('\n')}
| Unit tests | 102/102 PASS | verification/test.log |
| Playwright layouts | ${after.rows.length}/${after.rows.length} PASS | after/measurements.json |
| Playwright role interactions | ${after.interactions.length}/${after.interactions.length} PASS | after/measurements.json |
| Forms/interactions | ${flows.checks.length} checks y ${flows.forms.length} mediciones PASS | flows/results.json |
| Browser zoom real | ${zoom.length} rutas PASS | after/browser-zoom.json |
| Root / Push resolvers reales | PASS; se documenta N/A si una cuenta no tiene notificaciones | after/navigation.json |
| pgTAP aislado | ${assertions}/${assertions} PASS | verification/isolated-sql.json |
${backend.filter(row=>row.pass).map(row=>`| ${row.command} | PASS | verification/${row.command.slice(8).replaceAll(':','-')}.log |`).join('\n')}
| Portal integration preparado | PASS | verification/test-portal-prepared.log y portal-prepared.json |
| Console / network final | 0 inesperados | Único 400 intencional: login con credenciales inválidas |

El primer db:test sobre la base con datos previos falló por conteos/fixtures. Se preserva su log. Se reconstruyó una DB temporal usando las migraciones y seed originales, se ejecutaron las ${assertions} assertions y se eliminó sólo esa DB temporal; la fuente no se reseteó. Portal inicialmente esperaba Reviewer A sin A1: se preparó esa única membership y se restauró exactamente al terminar; la suite completa pasó. Los errores intermedios de navegador se conservan en round-1-measurements.json. Una ejecución de flujos fue interrumpida por un logout global del ensayo paralelo de zoom; la ejecución final está aislada de ese logout.

Build conserva el warning preexistente de chunk principal >500kB; no bloquea compilación ni se cambió el budget. No hubo cambios backend funcionales. Artefactos históricos de Phase 14 generados por las suites/build se copian a esta carpeta y se restauran a su versión previa para evitar reescribir reportes pasados.

## 9. Files Changed

${changed.map(file=>'- '+file).join('\n')}
- src/features/billing/billing.css (nuevo)
- src/features/messaging/ui/notification-badge.css (nuevo)
${scripts.map(file=>'- scripts/'+file+' (nuevo)').join('\n')}
- Este reporte, JSON/CSV/matrices, gate y evidencia bajo artifacts/final-visual-qa/.
- OMNIA_CRAFT_STATUS.md: resultado de la revisión final y enlace a evidencia.

Se preservan Action Plan, dependencias, migraciones y los archivos de skills que ya estaban sin trackear al iniciar.

## 10. Evidence

- ${screenshots} capturas locales seleccionadas; no una captura por combinación redundante.
- Before: before/login-375x667.png, before/login-390x844.png, before/login-1366x768.png y before/director--app-billing-375.png.
- After: mismos nombres en after/; conversaciones, Portal y standalone por rol. after/zoom-200-login.png muestra scroll accesible real con zoom.
- Forms: flows/*.png cubre validación, texto largo, Work guardado, Editorial, Billing, Integration y feedback cliente.
- after/measurements.json: ruta, rol, viewport, scrollWidth/clientWidth/scrollHeight, bounds, clipping, targets y scroll local intencional.
- route-viewport-matrix.csv: route/role/viewport/state/issue/fix/result. issue-matrix.csv: issue/área/evidencia/fix/result. visual-matrix.md: matriz legible. flows/results.json: interacciones, forms y contraste.
- verification/: logs originales y resultados de frontend/backend, SQL aislado y Portal preparado.
- ANTI_SLOP_DELIVERY_GATE.md: gate ejecutado por ítem y suplementos; no sustituye los límites de dispositivo declarados aquí.

## 11. Final Visual Status

**PASS** dentro del alcance verificado localmente: Login sin scroll evitable, cero overflow global estable, formularios y acciones alcanzables, navegación móvil y composer operables, sin errores inesperados de consola/red. El scroll de tablas, páginas largas, landscape corto y zoom es intencional.

## 12. Phase 17 Readiness

**READY para iniciar la preparación de Phase 17.** No equivale a aprobación de despliegue. Se mantienen los prerrequisitos de PRODUCTION_HANDOFF de Phase 15 y las pruebas físicas de teclado/standalone/push. No se hizo commit, deployment ni implementación de Phase 17.
`
writeFileSync(`${root}/FINAL_VISUAL_QA_REPORT.md`,text)
console.log(JSON.stringify({routes:paths.length,measurements:after.rows.length,checks:flows.checks.length,forms:flows.forms.length,contrastScreens:flows.contrast.length,sqlAssertions:assertions,screenshots,status:'PASS'},null,2))
