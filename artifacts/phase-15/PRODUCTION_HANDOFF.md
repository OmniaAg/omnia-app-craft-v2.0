# Phase 17 technical handoff — no operations performed

## MUST complete before production

1. Aprobar owners de seguridad/operación, roster administrativo, MFA/step-up, política de sesiones y aceptación manual por rol. Mantener proyectos/keys de local, staging y producción separados. QA determinística sólo local.
2. Crear/linkear Supabase Cloud **en Phase 17**, ejecutar migration dry-run + tipos/advisors/RLS y las suites contra staging. No usar config local de Auth/CORS ni seed de QA para producción.
3. Configurar public `VITE_APP_URL`/`VITE_SUPABASE_URL` HTTPS y publishable key; backend `APP_URL` HTTPS, `APP_ALLOWED_ORIGINS` exactos, tokens independientes `AUTOMATION_WORKER_TOKEN`/`PUSH_WORKER_TOKEN`, VAPID keypair + subject. Ninguno privado bajo `VITE_*`.
4. Webhooks: sólo `WEBHOOK_TRUSTED_ENDPOINTS` completos del operador y origins correspondientes. No destinos libres. Control egress/proxy confiable que bloquee redes privadas/metadata también después de DNS/redirect y validación de rebinding sobre la conexión real. `fetch` no fija IP; Phase 15 no promete esa garantía. Sin este control, mantener conexiones externas sin activar.
5. Criptografía: configurar `INTEGRATION_ENCRYPTION_KEYS` JSON (ID numérico versionado → key base64 de 32 bytes), `INTEGRATION_ACTIVE_KEY_VERSION`; conservar keys de lectura mientras existan envelopes viejos. Legacy `INTEGRATION_ENCRYPTION_KEY` sólo v1. Publicar keyring viejo+nuevo, cambiar versión activa, reencrypt con compare-and-swap transaccional, verificar cero envelopes anteriores y rollback, retirar clave vieja. El helper `rotate-integration-keys-local.mjs` es **local-only**, no herramienta de Cloud. Ejecutar el proceso Cloud con secret manager y acceso administrativo auditado.
6. Desactivar `PHASE13_ALLOW_LOCAL_HTTP`, `PHASE13_LOCAL_TEST_ONLY`, `PHASE14_LOCAL_TEST_ONLY` y `PUSH_SENDER=local_deterministic`. El runtime debe aceptar sólo sus transportes/proveedores expresamente aprobados. IA sigue determinística hasta una decisión posterior de proveedor/datos/costo.
7. Aplicar headers equivalentes a `scripts/security-headers.mjs` en el host real, con CSP connect-src HTTPS/WSS de Supabase, worker-src self, frame-ancestors none y nosniff. Scripts no requieren unsafe-inline/eval; style-src-attr unsafe-inline está acotado a atributos utilizados por React Grid Layout. HSTS sólo HTTPS. No desplegar Vite preview como servidor de producción.
8. Deploy versionado de tres Functions y scheduling seguro de workers. Configurar límites globales de tráfico/cuotas por actor/tenant del host y validar capacidad staging antes de tráfico público. Health/outbox: alertar cola antigua, retries agotados, lease recovery, fallos de firma y errores seguros por código; no loggear tokens/payloads privados. Webhooks siguen at-least-once; receptores deben deduplicar delivery_id/idempotency-key.
9. Backups/PITR según plan, RPO/RTO/retención, backup de objetos privados de Storage además de DB; restore en staging con bootstrap/owners de schemas internos Supabase/Realtime, ACLs, RLS y smoke por rol. El ensayo local cubre datos/Auth/Storage metadata/ACLs, no bytes físicos de Storage ni Cloud/PITR.
10. QA física Web Push en iOS/Android/desktop: permiso, instalación, recepción foreground/background, deep link, logout/user switch, revoked endpoint, TTL, 404/410/retry y VAPID real. Las pruebas determinísticas no prueban entrega de proveedor.
11. Release canary/rollback: bundle inmutable + versión previa, SW update/rollback, migrations forward-fix/restore probado, health checks, incident/contact/runbooks y aprobación de lanzamiento. Tener egress/secrets/headers correctos antes de tráfico.

## Recommended after launch

- RUM consentido para LCP/INP/CLS y p95 de RPCs con redacción. Lab local no es RUM ni load test de Cloud.
- Ajustar índices y connection/query limits con cardinalidad real; budget inicial main ≤550 kB (preferido <500), LCP lab <2.5s, CLS <0.1, página Billing 25 filas y precache público ≤1.25 MB (medido: 1.196 MB).
- Revisiones de acceso/retención/keys periódicas, SBOM y audit fijado del lockfile; no upgrades masivos durante cutover.
- Transporte con IP pinning verificado o proxy de egress según plataforma aprobada; nunca sustituir RLS por filtros frontend.

No se ejecutaron login/link/push/pull/deploy/upload de secrets/DNS ni configuración de proveedores reales.
