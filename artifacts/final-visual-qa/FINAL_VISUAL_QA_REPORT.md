# OMNIA CRAFT — FINAL VISUAL QA REPORT

Fecha: 2026-10-14, America/Mexico_City. Validación local de calidad final; no constituye una fase funcional nueva.

## 1. Executive Summary

- **Final Visual Status: PASS** para el alcance automatizado local documentado.
- 46 rutas/estados normalizados en matriz, 685 mediciones finales, cuatro roles: Director, PM scoped, Contributor y Client admin A.
- Diez tamaños solicitados y landscape 844 × 390. Director/Client cubren toda la matriz; PM/Contributor añaden 375 × 667, 768 × 1024 y 1366 × 768.
- 12 grupos de defectos corregidos. Cero defectos bloqueantes visuales abiertos en la verificación final. Round 1 conserva hallazgos y regresiones intermedias, no se ocultaron fallos.
- Quedan validaciones físicas de teclado, barras dinámicas y PWA/Web Push en iOS/Android para preparación de lanzamiento. La simulación local no demuestra comportamiento del SO.
- Sin deployment, commit, librerías nuevas, migraciones, cambios de RLS o lógica financiera. No se implementó Phase 17.

## 2. Login

La marca móvil imponía 19rem/22rem de altura antes del formulario. El panel añadía 48px de padding superior, márgenes grandes y encabezados de hasta 76px. En laptop el padding lateral/vertical de hasta 96px, el tamaño del heading y la suma de contenido/footer expandían el grid por encima del viewport.

Se conserva la composición de dos columnas en ancho suficiente. En móvil el logo pasa a una cabecera de 44px y el relato/señal no esencial se reserva para desktop. Se reutiliza la escala tipográfica; se acotan padding/gaps, se usa 100dvh y safe areas. En alturas cortas se reducen espacios y los campos conservan 44px. Nunca se ocultan controles para simular cabida. El body ya no suprime overflow horizontal.

| Viewport | document scrollHeight before → after | form top before → after | CTA bottom before → after | Resultado |
|---|---|---|---|---|
| 320 × 568 | 1020 → 568 | 609.5 → 263.1 | 916.5 → 507.0 | PASS, sin scroll |
| 360 × 740 | 1030 → 740 | 619.6 → 347.8 | 926.6 → 615.6 | PASS, sin scroll |
| 375 × 667 | 1006 → 667 | 595.5 → 297.3 | 902.5 → 565.2 | PASS, sin scroll |
| 390 × 844 | 1009 → 844 | 599.3 → 385.8 | 906.3 → 653.7 | PASS, sin scroll |
| 430 × 932 | 994 → 932 | 584.4 → 429.8 | 891.4 → 697.7 | PASS, sin scroll |
| 768 × 1024 | 1024 → 1024 | 633.5 → 475.8 | 917.4 → 743.7 | PASS, sin scroll |
| 1024 × 768 | 768 → 768 | 320.2 → 306.7 | 604.0 → 574.5 | PASS, sin scroll |
| 1366 × 768 | 841 → 768 | 374.8 → 317.4 | 658.7 → 585.3 | PASS, sin scroll |
| 1440 × 900 | 900 → 900 | 408.0 → 385.8 | 691.9 → 653.6 | PASS, sin scroll |
| 1920 × 1080 | 1080 → 1080 | 502.2 → 480.8 | 786.1 → 748.7 | PASS, sin scroll |
| 844 × 390 | 656 → 467 | 260.6 → 160.4 | 544.4 → 404.3 | PASS, scroll intencional |

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
| V01 | Login móvil: marca con min-height de 19/22rem antes del formulario | 375 × 667: CTA en 902.5px; documento 1006px | Cabecera compacta con logo de 44px; relato/señal sólo en composición amplia | Login sin scroll en los diez tamaños |
| V02 | Login laptop: padding de hasta 96px y titular de hasta 76px | 1366 × 768: documento 841px | Padding fluido acotado y titular con escala existente; 100dvh | Documento 768px; CTA 585.3px |
| V03 | Billing: utilidades de Tailwind sin runtime de Tailwind | Tabla de 416px escapaba en móvil | CSS propio, tabla semántica y región de scroll enfocables; se conserva cada columna | Sin overflow global; acciones mediante scroll de tabla |
| V04 | Work: mínimos intrínsecos en forms, labels, fieldsets y date inputs | 320px: editor de 313px sobre 288px disponibles | min-width:0 en los elementos que deben encoger; checklist con hit area de 44px | Formulario, texto largo y submit accesibles |
| V05 | CRM: pestañas Contacts/Opportunities expandían el grid | 375px: ancho de documento 736px | min-width:0 en secciones del detalle; tabla mantiene su scroll | Grid no propaga el mínimo de la tabla |
| V06 | Analytics: select de proyecto con opciones largas | 375px: 378px; tablet: 874px en viewport de 768px | Track minmax(0,1fr), select/input fluidos con mínimo cero | Sin overflow con Integration Project de fixtures reales |
| V07 | Reviews: superficies blancas heredaban texto claro del shell | Inspección de reviews.css y contraste del historial renderizado | Superficies, controles y metadata usan roles semánticos existentes | Versiones/revisores legibles; formularios medidos |
| V08 | Messages: heading oscuro sobre shell oscuro y composición desproporcionada | Capturas before de Messages y conversación | Texto exterior por tema; texto explícito en superficies blancas; historial flexible con scroll propio | Canal, historial, borrador, cambio de canal y submit accesibles |
| V09 | Notificaciones: contador dependía de CSS lazy y flotaba sobre el composer | Captura before de conversación e inspección de imports muestran el contador flotante y su CSS dependiente de ruta | Badge no interactivo dentro del enlace de navegación, CSS cargado con el componente | Sin overlay sobre textarea; un solo destino y realtime conservado |
| V10 | Menús: Escape no cerraba disclosure ni devolvía foco | Before: cuatro checks de Escape fallidos | Escape cierra y devuelve foco al trigger en ambos shells | Checks Director, PM, Contributor y Client pasan |
| V11 | Portal: novedades sin project_id enlazaban /portal/projects/null | Round 1: seis HTTP 400 derivados del enlace real | Fallback al listado de notificaciones y label Ver notificación | No hay enlaces null ni errores de red inesperados |
| V12 | Escala, foco, touch y viewport inconsistentes entre módulos | Titulares de hasta 60px; foco claro sobre blanco; targets pequeños | Escala font-size-2xl existente; foco según superficie; controles y enlaces principales de 44px; safe areas y interactive-widget | Formularios en 320/375/768/1366; teclado, zoom y contrastes verificados |

## 6. Visual Test Matrix

PASS significa que el documento no desborda horizontalmente, los elementos visibles no escapan fuera de un scroll intencional y los controles no están recortados por contenedores. Login añade cabida sin scroll cuando altura ≥568px. No significa que una página operativa larga deba caber completa. PM/Contributor complementan permisos/estados; no se extrapola su cobertura a tamaños no ejecutados.

| Route | 320 | 375 | 390 | 768 | 1366 | 1440 | 1920 |
|---|---|---|---|---|---|---|---|
| /login | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /forgot-password | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /reset-password | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /accept-invite | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /forbidden | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /missing-visual-qa | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/my-space | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/reviews | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/content-manager | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/projects | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/messages | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/notifications | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/settings | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/billing | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/editorial/calendar | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/analytics | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/automations | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/integrations | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/crm/accounts | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/crm/contacts | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/crm/opportunities | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/projects/:id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/deliverables/:id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/messages/:id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/crm/accounts/:id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/crm/accounts/:id?tab=brands | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/crm/accounts/:id?tab=contacts | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/crm/accounts/:id?tab=opportunities | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/crm/accounts/:id?tab=activity | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/projects/:id?tab=work | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/projects/:id/reviews | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/projects/:id/editorial | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/projects/:id/assistant | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /app/projects/:id?tab=work&workItem=:id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /portal | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /portal/projects | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /portal/approvals | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /portal/messages | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /portal/notifications | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /portal/documents | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /portal/reports | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /portal/settings | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /portal/projects/:id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /portal/deliverables/:id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| /portal/messages/:id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

Routing adicional: / redirige por contexto tras login; wildcard se prueba con /missing-visual-qa. /app/push/:notificationId y /portal/push/:notificationId son resolutores, cubiertos por PWA/Push y pruebas de destinos, no pantallas nuevas. Se conservan y no se omiten del inventario. Reset/accept-invite se revisan sin token (estado de enlace inválido); aceptación/recuperación real y auth errors están además en regresión Auth.

Los tamaños adicionales 360 × 740, 430 × 932, 1024 × 768 y landscape 844 × 390 están en el JSON, igual que teclado simulado a 375 × 360, reduced motion y standalone. Brands, Files y Work son pestañas/contextos reales, no rutas independientes inventadas.

## 7. Accessibility

- Keyboard: skip link a email, foco visible, Enter para menú y Escape con retorno al trigger; cuatro roles.
- Labels: 44 mediciones de forms verifican labels, bounds de controles y acción submit alcanzable. Se incluyen Projects, Work, Deliverables, Editorial, Billing, Automation Builder, Integration secret y feedback cliente cuando está disponible.
- Estados: vacío, validación, long text, Login pending/error, recuperación success y Work success mediante guardado local real. Éxitos/transiciones de Billing, Files, Messages y Approvals están cubiertos por sus suites reales; no se crearon conexiones externas para simular éxito de Integration.
- Zoom: chrome.tabs.setZoom(2), valor real confirmado, 11 rutas verificadas. Viewport CSS medido, sin overflow; Auth permite scroll y submit sigue alcanzable. No se sustituyó por CSS zoom ni pinch zoom.
- Touch: controles y enlaces principales con 44px; checkboxes conservan su visual pequeño dentro de labels accionables. Enlaces de texto inline no se equiparan a botones.
- Reduced motion: media reduce ejecutada y CSS revisado; no se añadió animación.
- Contraste: 49 evaluaciones de pantallas/estados con texto calculado; resultados completos en flows/results.json. Pares de control/foco y peor caso de las atmósferas de fondo en contrast-checks.txt. Esto no sustituye una certificación integral WCAG ni una revisión con lector de pantalla físico.
- PWA/safe areas: production SW real activo; rama standalone por navigator.standalone, insets CDP donde soportado y viewport-fit=cover. interactive-widget=resizes-content deja que Chromium ajuste altura al teclado. Teclado físico, Safari/iOS standalone y entrega Push nativa quedan pendientes de ensayo de dispositivos.

## 8. Verification

| Gate | Resultado | Evidencia |
|---|---|---|
| npm run typecheck | PASS | verification/typecheck.log |
| npm run lint | PASS | verification/lint.log |
| npm run test | PASS | verification/test.log |
| npm run build | PASS | verification/build.log |
| Unit tests | 102/102 PASS | verification/test.log |
| Playwright layouts | 685/685 PASS | after/measurements.json |
| Playwright role interactions | 18/18 PASS | after/measurements.json |
| Forms/interactions | 56 checks y 44 mediciones PASS | flows/results.json |
| Browser zoom real | 11 rutas PASS | after/browser-zoom.json |
| Root / Push resolvers reales | PASS; se documenta N/A si una cuenta no tiene notificaciones | after/navigation.json |
| pgTAP aislado | 796/796 PASS | verification/isolated-sql.json |
| npm run test:auth | PASS | verification/test-auth.log |
| npm run test:work | PASS | verification/test-work.log |
| npm run test:deliverables | PASS | verification/test-deliverables.log |
| npm run test:files | PASS | verification/test-files.log |
| npm run test:messaging | PASS | verification/test-messaging.log |
| npm run test:billing | PASS | verification/test-billing.log |
| npm run test:pwa | PASS | verification/test-pwa.log |
| npm run test:push | PASS | verification/test-push.log |
| Portal integration preparado | PASS | verification/test-portal-prepared.log y portal-prepared.json |
| Console / network final | 0 inesperados | Único 400 intencional: login con credenciales inválidas |

El primer db:test sobre la base con datos previos falló por conteos/fixtures. Se preserva su log. Se reconstruyó una DB temporal usando las migraciones y seed originales, se ejecutaron las 796 assertions y se eliminó sólo esa DB temporal; la fuente no se reseteó. Portal inicialmente esperaba Reviewer A sin A1: se preparó esa única membership y se restauró exactamente al terminar; la suite completa pasó. Los errores intermedios de navegador se conservan en round-1-measurements.json. Una ejecución de flujos fue interrumpida por un logout global del ensayo paralelo de zoom; la ejecución final está aislada de ese logout.

Build conserva el warning preexistente de chunk principal >500kB; no bloquea compilación ni se cambió el budget. No hubo cambios backend funcionales. Artefactos históricos de Phase 14 generados por las suites/build se copian a esta carpeta y se restauran a su versión previa para evitar reescribir reportes pasados.

## 9. Files Changed

- index.html
- src/app/shells/ClientPortalShell.tsx
- src/app/shells/InternalAppShell.tsx
- src/features/analytics/analytics.css
- src/features/auth/ui/auth.css
- src/features/automations/automations.css
- src/features/billing/screens/BillingScreen.tsx
- src/features/crm/ui/crm.css
- src/features/dashboard/ui/dashboard.css
- src/features/messaging/ui/NotificationBadge.tsx
- src/features/messaging/ui/messaging.css
- src/features/portal/screens/PortalOverviewScreen.tsx
- src/features/portal/ui/PortalPrimitives.tsx
- src/features/portal/ui/portal.css
- src/features/pwa/pwa.css
- src/features/reviews/ui/reviews.css
- src/features/work/ui/work.css
- src/shared/ui/FoundationShell.tsx
- src/styles/app.css
- src/styles/tokens.css
- src/features/billing/billing.css (nuevo)
- src/features/messaging/ui/notification-badge.css (nuevo)
- scripts/final-visual-qa.mjs (nuevo)
- scripts/final-visual-flows.mjs (nuevo)
- scripts/final-visual-zoom.mjs (nuevo)
- scripts/final-visual-navigation.mjs (nuevo)
- scripts/verify-final-visual.mjs (nuevo)
- scripts/final-visual-isolated-sql.mjs (nuevo)
- scripts/final-visual-portal-regression.mjs (nuevo)
- scripts/write-final-visual-report.mjs (nuevo)
- Este reporte, JSON/CSV/matrices, gate y evidencia bajo artifacts/final-visual-qa/.
- OMNIA_CRAFT_STATUS.md: resultado de la revisión final y enlace a evidencia.

Se preservan Action Plan, dependencias, migraciones y los archivos de skills que ya estaban sin trackear al iniciar.

## 10. Evidence

- 102 capturas locales seleccionadas; no una captura por combinación redundante.
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
