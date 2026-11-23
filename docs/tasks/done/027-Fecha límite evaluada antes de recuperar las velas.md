# Bug: la fecha límite se evalúa antes de recuperar las velas
2026-11-23 · Backend · Recordatorios de análisis · Encontrado al revisar la spec de push

Spec: §3.2 (pasos 4 y 8) y "Ciclo de vida" de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Qué pasa
`tick()` corre `sendDueDeadlines()` (paso 4) **antes** de `processSymbol()` (paso 8).
`findDueDeadlinesForUpdate` solo compara `deadline_at <= NOW()`
(`priceAlert.repository.js:144`). No sabe hasta qué vela se evaluó el símbolo.

Si el nivel se tocó **antes** de la fecha límite, pero esa vela todavía no se
había evaluado cuando vence la fecha, el mismo tick crea dos tarjetas:

1. `price_alert_deadline`: "60.000 no se tocó antes del 31/03", que es **falso**.
   Además pone `deadline_at = NULL`.
2. `price_alert_hit`: "tocó 60.000", con la vela anterior a la fecha límite.

## Cuándo ocurre
- **Tras una caída o un backoff de Binance**: el checkpoint del símbolo se queda
  atrás. La fecha límite vence durante el hueco, y el primer tick la emite
  antes de leer las velas atrasadas.
- **Sin caídas**: con el tick cada 30 min, basta un toque en los últimos ~30 min
  antes de la fecha límite. Ejemplo:
  - Fecha límite 10:00, toque a las 09:50, tick siguiente a las 10:10.
  - El paso 4 ve la fecha vencida; el paso 8 lee la vela de las 09:00 y ve el toque.

## Arreglo propuesto
Evaluar la fecha límite **con las velas**, dentro de la transacción de
`processSymbol`, comparándola con la hora de la vela y no con `NOW()`:

- Por cada alerta activa con `deadline_at`, después de `evaluateAlert`:
  - **Hay toque en una vela que empezó antes de `deadline_at`** → solo
    `price_alert_hit` (como hoy). La fecha límite deja de importar.
  - **No hay toque, y el nuevo checkpoint pasó la vela de la fecha límite**
    (`checkedUntil > deadline_at`, es decir, la vela que la contiene ya cerró y se
    evaluó) → `price_alert_deadline` + `deadline_at = NULL`, como hoy. La alerta
    sigue armada.
  - **Toque en una vela posterior a `deadline_at`** (el hueco cubrió las dos
    cosas) → las dos tarjetas, primero la fecha límite y después el toque. Las
    dos son ciertas.
- El paso 4 **se queda solo para símbolos que ya no se evalúan**
  (`market_symbols.invalid_at IS NOT NULL`), con la condición de hoy por
  `NOW()`. Si no, esas fechas límite no saltarían nunca.
- Coste: la tarjeta de fecha límite llega hasta ~1 h + un tick más tarde (espera
  a que cierre la vela de 1 h que la contiene). Para una fecha límite es
  aceptable.
- Con backoff de Binance, la fecha límite espera a que se lean las velas. Es lo
  correcto: hasta entonces no se puede saber si se tocó.

## Docs a actualizar
- Spec de recordatorios, §3.2:
  - El paso 4 ya no va antes del 8 para todos los símbolos.
  - La frase "Los pasos 3 y 4 van primero porque no dependen de Binance" pasa a
    valer solo para el paso 3 (recordatorios por fecha).
- Spec de recordatorios, "Ciclo de vida": la fila "Fecha límite vencida".

## Criterios de aceptación
- Con el job parado, una alerta con fecha límite 10:00 y un toque a las 09:50:
  al reanudar sale **solo** `price_alert_hit`.
- Sin toque, la tarjeta de fecha límite sale en el primer tick después de que
  cierre la vela que contiene la fecha.
- Un símbolo deslistado con alertas con fecha límite sigue avisando del
  vencimiento.
- Tests de `reminderJob.service.test.js` para los tres casos del arreglo y para
  el del deslistado.

## Seguimiento: re-armado con la fecha límite vencida
Con el arreglo, una alerta que toca antes de la fecha límite, pero se evalúa
después, queda disparada con la `deadline_at` vencida. Al re-armarla:
- Con un `PATCH` sin `deadline_at`, quedaba armada con esa fecha pasada y el
  siguiente tick emitía al momento una tarjeta de fecha límite falsa.
- Desde el modal, la fecha vencida se precargaba y bloqueaba el guardado
  ("La fecha límite debe ser futura").

Arreglo:
- `updatePriceAlert` (`priceAlert.service.js`): al re-armar, si la fecha límite
  ya venció y no llega una nueva, pasa a NULL. Editar sin re-armar no la toca:
  la sigue evaluando el job con las velas.
- `ReminderModal.jsx`: no precarga una fecha límite vencida y, si el campo
  sigue vacío, no la envía.
- Tests en `reminders.service.test.js`: vencida → NULL; futura → se conserva;
  nueva → se usa la nueva; edición sin re-armar → intacta.
