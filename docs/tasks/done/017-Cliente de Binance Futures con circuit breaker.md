# Task: cliente de Binance Futures con circuit breaker
2026-11-22 · Backend · Recordatorios de análisis 2/11 · Depende de: —

Spec: §3.1 y §4 de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Objetivo
Un único punto de acceso a la API pública de Binance Futures USDⓈ-M. Todo lo que
la feature pide a Binance (velas del job, sync del catálogo, caché de precios)
pasa por aquí, que es donde viven las protecciones contra un baneo de la IP que
compartimos con market-tracker.

## Alcance

### 1. `src/clients/binanceFutures.js` (carpeta nueva)
`fetch` nativo (el Dockerfile usa `node:20-alpine`), sin dependencias nuevas ni
API key.

```js
getHourlyKlines(symbol, startTimeMs, limit) // → [{ openTime, high, low, close }]
getExchangeInfo()                           // → [{ symbol, contractType, status, baseAsset, quoteAsset, tickSize }]
getAllPrices()                              // → Map<symbol, { price, time }>
getUsedWeight()                             // último x-mbx-used-weight-1m leído
setBackoffUntil(date) / getBackoffUntil()   // el job lo restaura al arrancar
```

| Función | Endpoint | Peso |
|---|---|---|
| `getHourlyKlines` | `GET /fapi/v1/klines?interval=1h` | 1 / 2 / 5 según `limit` |
| `getExchangeInfo` | `GET /fapi/v1/exchangeInfo` | 1 |
| `getAllPrices` | `GET /fapi/v2/ticker/price` (sin `symbol`) | 2 |

- **Peso**: guardar `x-mbx-used-weight-1m` de cada respuesta, también de las de
  error.
- **Circuit breaker**: ante `429` o `418`, backoff hasta `Retry-After`
  (segundos) o, si no viene, 60 s (429) / 5 min (418). Mientras dure, cualquier
  llamada lanza `BinanceBackoffError` (con `retryAfter: Date`) **sin tocar la
  red**.
- **`400` con `code: -1121`** → `BinanceInvalidSymbolError`. Otros errores HTTP
  → `Error` con el status y el cuerpo.
- **Timeout** de 10 s por petición (`AbortSignal.timeout(10_000)`).
- Klines: de arrays a objetos, con `Number(...)` sobre los strings de precio.
- `tickSize` del filtro `PRICE_FILTER`, nunca de `pricePrecision`.
- El cliente no toca la BD: persistir el backoff en `reminder_job_state` es
  cosa de los services (tasks 019 y 022).

### 2. Configuración — `config/env.js` → `config.binance`
| Variable | Default |
|---|---|
| `BINANCE_FUTURES_API_URL` | `https://fapi.binance.com` |
| `BINANCE_MAX_USED_WEIGHT` | `1200` |

Mismo patrón que `NOTE_PURGE_*` (Joi con default). `REMINDERS_TICK_MINUTES`
entra con el job (task 022).

### 3. Tests — `src/clients/__tests__/binanceFutures.test.js`
`global.fetch = jest.fn()`, sin red:
- 200 de klines → objetos numéricos; `getUsedWeight()` refleja el header.
- 429 con `Retry-After: 30` → `BinanceBackoffError` con fecha ≈ ahora + 30 s; la
  llamada siguiente falla sin invocar `fetch`.
- 429 sin `Retry-After` → 60 s; 418 sin `Retry-After` → 5 min.
- 400 con `-1121` → `BinanceInvalidSymbolError`; otro 400 → error genérico.
- `setBackoffUntil(futuro)` bloquea; `setBackoffUntil(pasado)` no.
- `getExchangeInfo` toma el `tickSize` de `PRICE_FILTER`.

## Criterios de aceptación
- `npm test` y `npm run lint` pasan.
- Con el breaker abierto, `fetch` no se invoca (comprobado en test).
- Ninguna petición queda colgada más de 10 s.

## Verificación manual
Una sola llamada real a `getExchangeInfo()` en dev (peso 1) para confirmar que
llegan contratos `PERPETUAL` y `TRADIFI_PERPETUAL` (p. ej. `BTCUSDT` y
`XAUUSDT`) con su `PRICE_FILTER`. Si el tipo de los TradFi tuviera otro nombre,
corregir el filtro de la task 019 y la spec.
