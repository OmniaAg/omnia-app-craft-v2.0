# Aplicación de las leyes de UX

El PDF de *Laws of UX*, segunda edición, no estaba disponible entre los adjuntos accesibles ni en `docs/ux-references/`. Se aplica el fallback autorizado: los diez principios descritos en la instrucción del usuario. No se atribuyen citas ni verificación directa del libro.

| Principio | Problema original | Decisión concreta | Evidencia |
|---|---|---|---|
| Jakob | Modelos de navegación distintos | Cabecera agrupada compartida y enlaces nativos | Router y pruebas de navegación/teclado |
| Fitts | Controles pequeños o superpuestos | Objetivos de navegación de 44 px y corrección del menú de widgets | Accesibilidad y dashboard-controls |
| Miller | Lista plana de módulos | Grupos por tarea y contexto; sin regla arbitraria de siete | navigation.ts y matriz de destinos |
| Hick | Muchas decisiones simultáneas | Personalización y acciones secundarias en su contexto | Vista normal frente a Personalizar |
| Postel | Validación incompatible con IDs válidos | GUID de recursos autoritativos; errores y reintento conservan entradas | Prueba de identificadores y fallos controlados |
| Peak–End | Pérdida al renovar o terminar un guardado | Recuperación privada y finalización confirmada | Red/green Auth y commit-cleanup |
| Aesthetic–Usability | Riesgo de cambiar identidad sin mejorar uso | Paleta y tipografías existentes, con jerarquía comprobada funcionalmente | Capturas Internal/Portal |
| Von Restorff | Controles de layout compitiendo con tareas | Prioridad de atención y un modo explícito de edición | Dashboard y resumen operativo |
| Tesler | UUID manual y secuencias difíciles de construir | Selectores autorizados, concepto atómico y builder guiado | Billing, workflow y RPC |
| Doherty | Incertidumbre durante solicitudes | Estado inmediato pending y confirmación tras servidor, sin progreso inventado | Formularios bloqueados y estados de guardado |

No se afirma una latencia universal inferior a 400 ms. No se incorporan urgencia falsa, métricas decorativas ni porcentajes de avance sin denominador. Las cifras de pruebas representan observaciones técnicas, no resultados de investigación con usuarios.
