# Registro del refactor UX

Fecha de cierre: 2026-10-15, America/Mexico_City. Repositorio inicial limpio en a460f0a. Trabajo local, sin commit, despliegue, Supabase Cloud, migraciones remotas ni cambios DNS. No se añadieron dependencias. Antislop DURING fue elegido expresamente en esta sesión. Se conservó la dirección de DESIGN.md.

## Alcance y evidencia

Se aplicó el encargo adjunto y la cobertura completa a Internal, Portal, autenticación, router, subrutas y componentes compartidos. El PDF de Laws of UX no estaba accesible; se utilizó el fallback autorizado a los principios del texto.

El inventario AST incluye imports locales estáticos/dinámicos: 45 entradas, 134 archivos, 97 componentes funcionales y 465 controles únicos por archivo/línea/columna. coverage.json y COVERAGE_MATRIX.md incluyen revisión, hallazgos, conservación/cambios y pruebas. Un fingerprint protege la conciliación con la fuente verificada.

## Cambios

Navegación superior compartida; Auth sin desmontaje para el mismo actor; Developer independiente con autoridad de Dirección; borradores privados en servidor con RLS, CAS monotónico y caducidad; finalización confirmada sin repetir creaciones conocidas; idempotencia de mensajes tras recarga; prioridades reales y cuatro defaults del dashboard; builder visual; Billing con selector, concepto atómico y pago explícito; validación y ámbitos CRM; perfil propio editable; formularios protegidos durante envío; errores legibles; tabs completos; checkboxes alineados y compositor contenido con listas acotadas.

## Verificación

Se ejecutaron typecheck, lint, test y build: 109 tests en 21 archivos, sin errores. Permanece el aviso conocido de entrada JS superior a 500 kB. Logs y tamaños comparables están en verification.

npm.cmd run db:lint informó No schema errors found. npm.cmd run db:types:check confirmó tipos vigentes. La reconstrucción SQL en una base desechable aislada ejecutó 17 suites/850 aserciones. Sesiones reales Auth/RLS pasaron 23 checks de paridad/aislamiento.

ux-regressions.mjs pasó sus 14 grupos, incluido el grupo preparado con Work, Deliverables, Analytics, Portal y seguridad. Membresías y grants temporales se restauraron exactamente. Phase 13 usa proyectos nuevos y concurrencia un título único por ejecución; se mantienen las aserciones de dominio.

Navegador: 2,091 observaciones del router, 255 aperturas de pestañas/paneles, 0 overflow y 0 errores JS. Los recorridos principal, secundario, correo/Auth, persistencia, accesibilidad y confirmación visual tienen JSON independientes. Persistencia completó 33 checks, incluida recarga de conflicto, formato incompatible, foco real, offline y cambio de usuario. VERIFICATION.md contiene los recuentos finales de las suites ampliadas.

Se inspeccionaron las hojas de contacto y las capturas completas de confirmación. La galería conserva el historial y señala imágenes sustituidas por los ajustes finales. Zoom Chrome real al 200 % y display-mode standalone comprobados. No se simularon dispositivos físicos ni investigación con personas.

## Incidencia local y recuperación

Un primer runner llamó al agregador histórico test-phase15-security.mjs sin detectar su reset. Reinició por error la base fuente local. Fue un error de ejecución y se comunicó al usuario.

El backup completo anterior a las migraciones, en la ruta ignorada supabase/.temp/ux-refactor/before.dump, se restauró en otra base. Se verificaron recuentos y se intercambió con postgres; la base reiniciada se retuvo como omnia_ux_reset_replaced. restoration.json registra 13 usuarios Auth, 5 proyectos, 22 trabajos, 13 archivos, 5 documentos y 11 mensajes recuperados. Son recuentos de la restauración, anteriores a los nuevos fixtures QA. Se reaplicaron migraciones locales y se restableció el gateway. No se tocó una base remota.

Los runners corregidos no ejecutan ese agregador. ux-db-verify.mjs reconstruye únicamente su base temporal. Las herramientas ux-apply-local, ux-restore-local-backup y ux-swap-restored-local son trazas de esa operación puntual: no forman parte de la secuencia normal de QA ni deben repetirse para ejecutar pruebas.

## Aislamiento de QA

Algunos intentos se interrumpieron por cierre del servidor dev, rotaciones simultáneas de credenciales de fixtures o selectores incorrectos. Se repitieron con el servidor disponible, selectores observados y sesiones aisladas. Portal se reanudó en preview conservando las observaciones Internal terminadas. Los intentos fallidos no se convirtieron en resultados exitosos; los JSON finales provienen de ejecuciones que terminaron.

La CLI necesitó permiso local para su telemetría fuera del workspace. El escaneo de secretos se repitió con permiso e incluye código, build, migraciones y evidencia UX sin imprimir secretos. No quedó una acción bloqueada por aprobación automática.

Se cerró el receptor webhook QA propio antes de iniciar el receptor de las regresiones. Dev usa 53172 y preview 53170; 53171 se reserva a PWA. Si el entorno termina procesos largos, deben relanzarse sus comandos.

## Resultado

FINAL_REPORT.md y COVERAGE_MATRIX.md contienen resultado y límites. No queda una pantalla/componente sin revisar en la matriz local. Se preservan los artefactos históricos; la evidencia nueva se guarda en ux-refactor. Debe regenerarse Phase 17 con el build, tipos y tres migraciones nuevas antes de preparar un release manual. No se generó ni desplegó ese paquete.
