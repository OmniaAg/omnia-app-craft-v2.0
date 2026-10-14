# Phase 15 brief

Fecha: 2026-10-13 (America/Mexico_City). Base: e912123, Phase 14; árbol limpio al iniciar.

Objetivo: auditar y endurecer el alcance existente, medir y optimizar únicamente problemas demostrados y ejecutar los gates locales. No commit, despliegue, conexión Cloud, Phase 17 ni cambios retrospectivos a migrations. Action Plan prevalece; Phase 16 no aplica.

Decisiones preservadas: autoridad por memberships + capabilities vigentes + scope; founder/departments no autorizan; Organization membership no implica Project; archivos privados; publicación cliente explícita; comandos transaccionales; workers con fencing/idempotencia; IA local determinística con aprobación humana; PWA sólo shell estático, sin datos privados offline.

Scope: migrations nuevas, policies/grants/RPCs, tres Edge Functions y helpers, Auth/Query/Realtime, webhook transport, criptografía versionada, PWA/Push, configuración/headers, dependencia transitiva vulnerable, scripts QA y evidencia. Sin features comerciales.

Gates: db:start/reset/test/lint/types/types:check/advisors, typecheck/lint/test/build; 15 suites previas secuenciales con reset entre suites; PWA/Push; adversarial SQL/HTTP; concurrencia real; backup/restore local aislado; production preview + cuatro viewports + usuarios de QA; npm audit + secret scan; comparación SQL/bundle/network.

Decisiones humanas pendientes para Phase 17: proveedor/hosting/red/secrets/región/retención/owners/MFA/aceptación manual y QA física Push. No se inventa aceptación.
