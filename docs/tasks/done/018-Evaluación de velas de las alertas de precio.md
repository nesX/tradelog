# Task: evaluación de velas (`evaluateAlert`) como función pura
2026-11-22 · Backend · Recordatorios de análisis 3/11 · Depende de: —

Spec: §3.3 y ejemplos de §3.2 de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Objetivo
La pieza crítica de la feature: dadas una alerta y las velas de 1h leídas desde
el checkpoint, decidir si toca el aviso de cercanía, el disparo o nada, y con
qué vela. Sin BD, sin red y sin reloj, para testearla aislada.

## Alcance

### 1. `src/services/priceAlertEvaluator.js`
```js
evaluateAlert(alert, candles, nowMs) // → { near: candle | null, hit: candle | null }
isWithinNearBand(alert, price)       // → boolean (create y re-armado, task 020)
```

- `alert`: `{ direction, target_price, is_invalidation, near_pct, near_at,
  armed_at }`, con los `NUMERIC` ya convertidos a `Number` por el repository.
- `candles`: `[{ openTime, high, low, close }]` ordenadas por `openTime` (ms,
  UTC).
- `nowMs`: el instante **previo a la petición** de velas, no el de la
  evaluación. Así una vela de 23:00 que cierra mientras la petición viaja no se
  da por cerrada con un `close` parcial.

Reglas de §3.3:
- Se ignoran las velas con `openTime + 1h <= armed_at`.
- En la vela que contiene `armed_at` solo cuenta el `close`, tanto para la
  cercanía como para el disparo.
- Cercanía, solo si `near_pct != null` y `near_at == null`, siempre por toque
  (también en invalidaciones): `above` → `high >= target × (1 − near_pct/100)`;
  `below` → `low <= target × (1 + near_pct/100)`.
- Recordatorio normal: primera vela con `high >= target` (`above`) o
  `low <= target` (`below`).
- Invalidación: solo velas de 23:00 UTC ya cerradas (`openTime + 1h <= nowMs`),
  comparando el `close`.
- Disparo y cercanía en la misma pasada: el job emite solo la tarjeta del
  disparo y rellena `near_at`. La función devuelve las dos velas y decide el
  job.

### 2. Tests — `src/services/__tests__/priceAlertEvaluator.test.js`
Los casos mínimos de §3.3 y los tres ejemplos de §3.2 como tests de escenario:
- Toque por mecha en una vela posterior al armado.
- Vela del armado con mecha previa más allá del nivel → no dispara; con `close`
  más allá → dispara.
- Velas anteriores al armado con toque → se ignoran (alerta re-armada sobre un
  checkpoint viejo).
- Cercanía sin toque; cercanía y toque en la misma vela.
- `near_at` ya relleno → no repite la cercanía.
- Catch-up de 48 velas: `hit` es la primera vela que toca, no la última.
- Recuperación tras 8 h (§3.2): 9 velas y el disparo en la vela de las 05:00.
- Tick normal (§3.2): con `near_at` relleno tras el primer tick, re-evaluar la
  vela de las 14:00 no devuelve otra cercanía.
- Invalidación: mecha más allá con cierre diario por debajo → sin disparo, con
  cercanía.
- Invalidación: vela de 23:00 todavía abierta con `close` más allá → sin
  disparo.
- Invalidación: vela de 23:00 cerrada más allá → disparo con esa vela.
- Invalidación armada a las 23:30 UTC → cuenta el cierre de las 00:00.
- La tabla miércoles/jueves/viernes de §3.2, completa.

## Criterios de aceptación
- `npm test` pasa con todos los casos.
- El módulo no importa nada de `config/`, `repositories/` ni `clients/`.
