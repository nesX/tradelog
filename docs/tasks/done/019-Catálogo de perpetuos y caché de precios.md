# Task: catálogo de perpetuos (sync diario) y caché de precios
2026-11-22 · Backend · Recordatorios de análisis 4/11 · Depende de: 016, 017

Spec: §3.5, §3.6, §3.8 y §3.7 (Catálogo) de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Objetivo
Tener en BD el catálogo de perpetuos que alimenta el combobox del modal y
respalda la FK de las alertas, y servir el precio en vivo del modal desde el
backend. Coste fijo en Binance: una llamada al día para el catálogo y como
máximo una por minuto para precios, con independencia del número de usuarios.

## Alcance

### 1. Repositories
- `marketSymbol.repository.js`: upsert en lote, `listActive(userId)` (primero
  los símbolos que el usuario usó en alertas, por la alerta más reciente; luego
  alfabético), `findBySymbol`, `markInvalid`, `countActive`. Convertir los
  `NUMERIC` (`tick_size`, `last_price`) a `Number`: `pg` los devuelve como
  string.
- `reminderJobState.repository.js`: lectura de la fila única y setters de
  `catalog_synced_at`, `backoff_until` y `last_run_at` (los dos últimos los usa
  el job, task 022).
- `notification.repository.js`: `insert(client, { userId, type, priceAlertId,
  dateReminderId, payload })` y la lectura del anclaje (título de la nota,
  contenido del bloque). Lo amplían las tasks 020–022.

### 2. Payload de las tarjetas — `src/services/notificationPayload.js`
Funciones puras que arman la foto de §3.6 a partir de la alerta (o el
recordatorio), el símbolo, la vela (o `null`) y el anclaje. `block_excerpt`: ~280
caracteres sin markdown (quitar `#`, `*`, `_`, `` ` ``, `>`, las directivas
`:::` y dejar solo el texto de los links); en anclajes de nota, el del primer
bloque de texto. Las reutilizan las tasks 021 y 022.

### 3. `marketSymbol.service.js → syncCatalog()`
Los pasos de §3.5:
1. `getExchangeInfo()` → quedarse con `status = 'TRADING'` y `contractType` en
   `PERPETUAL` o `TRADIFI_PERPETUAL`.
2. Salvaguarda: si el catálogo no está vacío y llega menos del 50% de sus
   símbolos vigentes → `logger.warn` y no tocar nada (tampoco
   `catalog_synced_at`).
3. Upsert de `symbol`, `contract_type`, `base_asset`, `quote_asset` y
   `tick_size`; los que tenían `invalid_at` y volvieron a `TRADING` → NULL.
4. Vigentes que ya no llegan → deslistado: `invalid_at = NOW()` y, en la misma
   transacción, una tarjeta `price_alert_delisted` por cada alerta activa del
   símbolo con la nota no borrada. Exponerlo como función propia: el job lo
   aplica también ante `BinanceInvalidSymbolError` (task 022).
5. `catalog_synced_at = NOW()`.

`BinanceBackoffError` → persistir `backoff_until` y propagar. La comprobación de
"más de 24 h" la hace el job; aquí `syncCatalog()` siempre sincroniza.

### 4. `marketPrice.service.js` (caché en memoria)
- `getPrice(symbol)` → `{ price, as_of }` o `{ price: null }`. Si la caché tiene
  más de 60 s, la refresca con **una** llamada a `getAllPrices()`; las
  peticiones concurrentes esperan la misma promesa (single-flight).
- Breaker abierto, `getUsedWeight() > BINANCE_MAX_USED_WEIGHT` o llamada
  fallida → último precio cacheado; si no hay, `last_price` del catálogo (con
  `last_price_at` como `as_of`); si tampoco, `{ price: null }`.

### 5. Endpoints — `routes/marketSymbol.routes.js` en `/api/market-symbols`
| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/api/market-symbols` | Catálogo vigente con `contract_type`, `base_asset`, `quote_asset`, `tick_size`, `last_price`, `last_price_at`. Sin Binance. |
| `GET` | `/api/market-symbols/:symbol/price` | `getPrice()`. `:symbol` validado con `/^[A-Z0-9]{2,30}$/`. |

Patrón de `docs/development/workflow.md` (validator, controller, routes) y
montaje en `server.js` con `authenticate`.

### 6. Tests
- `syncCatalog` con cliente y repos mockeados: el primer sync (catálogo vacío)
  solo inserta; salvaguarda del 50%; deslistado → `invalid_at` y tarjetas;
  re-listado → `invalid_at = NULL`.
- `getPrice`: dos llamadas concurrentes → un solo `getAllPrices`; TTL de 60 s;
  cadena de fallbacks.
- Payload: extracto sin markdown y cortado a ~280 caracteres.

## Criterios de aceptación
- Tras el primer sync en dev, `market_symbols` tiene cientos de filas, entre
  ellas alguna `TRADIFI_PERPETUAL` (`XAUUSDT`).
- `GET /api/market-symbols` no genera ninguna petición a Binance.
- Pedir el precio de varios símbolos durante un minuto genera una sola petición
  a Binance.
- `npm test` y `npm run lint` pasan.

## Verificación
El job todavía no existe (task 022): lanzar el sync a mano en el contenedor del
backend de dev, p. ej.
`node --input-type=module -e "const m = await import('./src/services/marketSymbol.service.js'); await m.syncCatalog(); process.exit(0)"`.
