# Task: puesta en producción y documentación de las notificaciones push
2026-11-23 · Operaciones + Docs · Notificaciones push 5/5 · Depende de: 028–031

Spec: §3.8, §6 (pasos 8–9) y "Verificación" de
[notificaciones-push-pwa.md](../../features/specs/notificaciones-push-pwa.md).

## Objetivo
Activar el push en prod y comprobarlo en dispositivos reales, sobre todo en
iPhone, que solo se puede probar en prod (HTTPS y app instalada).

## Alcance

### 1. Despliegue (en este orden)
1. Aplicar la `029_migration_push_subscriptions.sql` en prod **antes** del push
   a `main` (ver `docs/operations/database-ops.md`).
2. Generar las claves de prod con `npx web-push generate-vapid-keys` y añadir
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` al `.env` de la VPS
   (`trading-journal/.env`). Las claves **no se rotan** (§3.8).
3. Push a `main` y comprobar en los logs del backend:
   - No aparece "Web Push desactivado".
   - El primer tick no avisa del histórico.

### 2. Verificación en dispositivos
- **Android**: activar en `/recordatorios` → "Enviar prueba" → tocar el aviso
  con la app cerrada y en segundo plano.
- **iPhone**:
  - En Safari sin instalar, la sección explica cómo instalar.
  - Instalar → activar → "Enviar prueba".
  - Tocar el aviso con la app cerrada y en segundo plano.
- **Cercanía → toque**: con una alerta real o de prueba, el toque reemplaza la
  notificación de cercanía y vuelve a sonar. En iPhone, anotar qué hace
  (Safari ignora `renotify`).
- **Dos cuentas** en el mismo navegador: el dispositivo nunca recibe los avisos
  de una cuenta distinta a la que lo está usando.

### 3. Documentación
- `docs/operations/env-vars.md`: las tres variables, cómo generar las claves y
  por qué no se rotan.
- `docs/api/reference.md`: los cinco endpoints de `/api/push`.
- `docs/architecture/database.md`: `push_subscriptions` y
  `reminder_job_state.push_notified_id`.
- `docs/architecture/backend.md`: `clients/webPush.js`, la marca de agua y su
  invariante (no paralelizar el tick).
- `docs/architecture/frontend.md`: el SW propio (`src/sw.js`) y `PushBridge`.
- `CLAUDE.md`: el mount `/api/push`, y que `/recordatorios` también gestiona
  los avisos del dispositivo.
- `docs/features/README.md` y `docs/roadmap.md`: estado ✅.
- Mover las tasks 028–032 a `docs/tasks/done/`.

## Criterios de aceptación
- Un aviso real (una tarjeta creada por el job) llega a un Android y a un
  iPhone vinculados.
- La documentación refleja las variables, los endpoints, la tabla y el SW.

## Notas de la implementación (2026-11-23)
- **FCM puede responder 410 justo después de suscribir** (visto en Chrome
  headless con perfiles nuevos; a los segundos da 201). Si pasa en un
  dispositivo real, "Enviar prueba" justo después de activar dice "se volvió a
  suscribir, envía la prueba de nuevo". Anotar si ocurre y si el segundo intento
  llega.
- Probar `notificationclick` (app cerrada y en segundo plano): no se pudo
  automatizar.
