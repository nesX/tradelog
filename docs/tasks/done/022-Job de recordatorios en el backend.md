# Task: job de recordatorios dentro del backend
2026-11-22 · Backend · Recordatorios de análisis 7/11 · Depende de: 017, 018, 019, 020, 021

Spec: §3.2, §3.4 y §4 de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Objetivo
El motor de la feature. Cada 30 min, dentro del proceso del backend (sin
contenedor extra), envía los recordatorios por fecha y las fechas límite
vencidos, sincroniza el catálogo una vez al día y evalúa las velas nuevas de
cada símbolo con alertas activas. Sin ráfagas a Binance y sin perder toques
aunque el backend haya estado caído.

## Alcance

### 1. Programación — `startReminderJob()` en `server.js`
- `REMINDERS_TICK_MINUTES` en `config/env.js` (default 30; `0` desactiva el job
  con un `logger.info`, como `startNotePurgeJob`).
- Cadena de `setTimeout`, no `setInterval`: cada tick programa el siguiente al
  terminar, también si falla. El primer tick va en
  `max(ahora + 1 min, last_run_at + intervalo)`; sacar ese cálculo a una función
  pura para testearlo.
- Al arrancar, pasar `reminder_job_state.backoff_until` al cliente
  (`setBackoffUntil`).
- Llamarlo en `startServer()` después de `startNotePurgeJob()`.

### 2. `reminderJob.service.js → runTick()`
Los pasos de §3.2:
1. `pg_try_advisory_lock(<clase>, 0)` en un client dedicado del pool, con la
   forma de dos enteros para no chocar con `withUserLock`
   (`pg_advisory_xact_lock(userId)`, `config/database.js:76`). Sin lock →
   salir. `pg_advisory_unlock` y `release()` en `finally`.
2. `last_run_at = NOW()`.
3. Recordatorios por fecha vencidos, con la nota no borrada y `FOR UPDATE` →
   `status = 'sent'`, `sent_at = NOW()` y tarjeta `date_reminder_due`. Una
   transacción.
4. Fechas límite vencidas de alertas activas, con la nota no borrada y
   `FOR UPDATE` → tarjeta `price_alert_deadline` y `deadline_at = NULL`. Una
   transacción.
5. `backoff_until > NOW()` → terminar el tick.
6. `catalog_synced_at` NULL o de hace más de 24 h → `syncCatalog()` (task 019).
7. Símbolos vigentes con alertas activas en notas no borradas. Ninguno →
   terminar sin pedir velas.
8. Por símbolo, **en serie y con 1 s entre peticiones**:
   - desde = `checked_until` (si es NULL, el inicio de la hora actual);
     `n = floor((ahora − desde) / 1 h) + 1` y `limit = min(n, 1000)`. Si
     `n > 1000`, paginar con `startTime` = última `openTime` + 1 h.
   - `nowMs` = el instante previo a cada petición (ver task 018).
   - Si `getUsedWeight() > BINANCE_MAX_USED_WEIGHT` → procesar lo ya leído y
     cortar el bucle.
   - Una transacción por símbolo: alertas activas con
     `FOR UPDATE OF price_alerts`, `evaluateAlert`, el `UPDATE` de cada alerta
     (`near_at`, o `status = 'triggered'` y `triggered_at`) con su tarjeta
     (`price_alert_near`, `price_alert_hit` o `price_alert_invalidation`, esta
     con `sibling_alerts`) y, al final, `checked_until` = `openTime` de la
     última vela, `last_price` = su `close` y `last_price_at = NOW()`.
9. Errores:
   - `BinanceBackoffError` → persistir `backoff_until` y cortar el tick.
   - `BinanceInvalidSymbolError` → el tratamiento de deslistado de la task 019.
   - Cualquier otro (red, timeout) → `logger.error` y seguir con el siguiente
     símbolo; el checkpoint de ese símbolo no se movió.

Un `logger.info` por tick solo cuando haya algo que contar (símbolos revisados,
tarjetas creadas, peso usado), para no llenar el log cada 30 min.

### 3. Tests — `src/services/__tests__/reminderJob.service.test.js`
Repos, cliente y pool mockeados:
- Sin alertas activas → ninguna llamada a `getHourlyKlines`.
- Backoff vigente → corren los pasos 3–4 y no hay llamadas a Binance.
- Sin advisory lock → no corre nada.
- Peso por encima del umbral tras el primer símbolo → el segundo no se pide.
- `BinanceInvalidSymbolError` en A → A se deslista y B se procesa.
- Error de red en A → B se procesa y el checkpoint de A no cambia.
- Hueco de más de 1000 h (nota restaurada con un checkpoint viejo) → pagina.
- Primer tick: último tick hace 10 min → espera 20; hace 2 h → 1 min;
  `last_run_at` NULL → 1 min.

## Criterios de aceptación
- `REMINDERS_TICK_MINUTES=0` → el job no arranca y lo dice en el log.
- Tres reinicios del backend en 10 min no adelantan ningún tick ni generan
  peticiones extra a Binance.
- Con el backend parado más de una hora, el primer tick corre al minuto de
  arrancar y recupera las velas del hueco en una sola petición.
- En dev, con `REMINDERS_TICK_MINUTES=2`: una alerta con el nivel ya cruzado
  (el `close` de la vela del armado lo supera) genera su tarjeta en el
  siguiente tick.
- `npm test` y `npm run lint` pasan.
