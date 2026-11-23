# Feature: Recordatorios de análisis (precio y fecha)

## 1. Resumen

Permitir anclar a un bloque (o a una nota entera) recordatorios que devuelven un análisis en el momento en que importa:

- **Por precio**: "avísame cuando `BTCUSDT` toque `60,000`", o "avísame si `BTCUSDT` cierra el día por encima de `110,000`" (invalidación).
- **Por fecha**: "recuérdame revisar este análisis el 1 de marzo".

Un job del backend vigila el precio en **Binance Futures (perpetuos USDⓈ-M)**, que cubre cripto y activos tradicionales (oro, plata, petróleo, gas, acciones, ETFs), y crea **tarjetas** en una bandeja nueva, `/recordatorios`. Las tarjetas no se cierran solas: requieren una acción manual.

### Motivación

Un análisis de largo plazo (ej. "BTC volverá a la zona de 60k") puede tardar un año en cumplirse. En ese tiempo se escriben decenas de análisis nuevos y el original queda enterrado. Cuando el precio por fin llega, o cuando la tesis se invalida, nadie se acuerda de releerlo. El recordatorio convierte el análisis en algo que vuelve solo en el momento en que importa.

### Casos de uso

1. **Objetivo de largo plazo**: análisis macro de BTC con objetivo en 60k. Se crea la alerta en el bloque del escenario; meses después aparece la tarjeta "BTCUSDT tocó 60,000" con el extracto del análisis y un link directo al bloque.
2. **Invalidación**: el mismo bloque lleva una segunda alerta en 110k marcada como invalidación. No salta por una mecha: solo si una vela diaria cierra por encima de 110k. La tarjeta "Tesis invalidada" ofrece borrar las demás alertas del bloque, porque el objetivo ya no aplica.
3. **Aviso previo**: con un aviso de cercanía del 3%, la tarjeta "BTCUSDT a 2.1% de 60,000" llega antes del toque y da tiempo a releer el análisis y preparar la operación.
4. **Re-armado**: el precio tocó el objetivo y el análisis sigue vigente con un nuevo nivel. Desde la tarjeta se re-arma la alerta con otro precio.
5. **Recordatorio por fecha**: "revisar este análisis tras el cierre trimestral". No depende del precio ni de Binance.
6. **Fecha límite**: la alerta de 60k lleva fecha límite 31/03/2027. Si llega esa fecha sin tocarse, aparece la tarjeta "60,000 no se tocó antes del 31/03 — ¿sigue vigente?".
7. **Activos tradicionales**: un análisis del oro con alerta en `XAUUSDT`, uno de petróleo en `CLUSDT`, uno de Nvidia en `NVDAUSDT`.
8. **Programadas**: un solo lugar para consultar y administrar todo lo armado: alertas ordenadas por distancia al nivel y recordatorios por fecha.
9. **Historial**: qué análisis llegaron a su objetivo, cuáles se invalidaron y cuánto tardaron.

### Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Motor | **Propio en TradeLog**, sin depender de Market Tracker. Reemplaza la decisión anterior de esperar a Market Tracker v2 y recibir los eventos por RabbitMQ: TradeLog es multiusuario y no debe depender de que Market Tracker esté arriba, cubre cualquier perpetuo y una tesis de largo plazo no necesita tiempo real. |
| Mercado | Solo **Binance Futures USDⓈ-M**: perpetuos cripto (`PERPETUAL`) y TradFi (`TRADIFI_PERPETUAL`: metales, energía, acciones, ETFs). Sin spot. |
| Canal | **In-app** (bandeja `/recordatorios`). Sin Telegram. Web Push se añadió después como canal adicional que avisa de cada tarjeta nueva: ver [`notificaciones-push-pwa.md`](notificaciones-push-pwa.md). |
| Granularidad | **Velas de 1h**. Checkpoint por símbolo; nunca se pide historial ya revisado. |
| Anclaje | Bloque **o** nota (exactamente uno de los dos). Si se borra un bloque, sus alertas y recordatorios pasan a la nota. |
| Disparo | Por defecto, **toque** (`high`/`low` de la vela). Las alertas marcadas como **invalidación** saltan solo por **cierre diario**. Una vez por armado. |
| Recordatorios por fecha | Sí, en la misma bandeja. No usan Binance. |
| Fecha límite | Opcional en las alertas de precio. |
| Frecuencia | Tick fijo cada 30 min; cada tick revisa todos los símbolos con alertas activas. |
| Catálogo | Sync diario de `exchangeInfo` de futuros (peso 1). Sin validación símbolo a símbolo. |
| Precio en vivo del modal | Lo sirve el backend desde una caché en memoria de 60 s (una sola llamada para todos los perpetuos). El navegador no llama a Binance. |
| Peticiones a Binance | Mínimas y defensivas: la VPS comparte IP con market-tracker, que también usa perpetuos, y un baneo afectaría a ambas apps (ver §4). |
| Ejecución del job | Dentro del proceso del backend (mismo contenedor), como la purga de notas. Sin contenedor extra. |

### Objetivos de diseño

- **No perder toques ni cierres**: una alerta vive meses y pasa por decenas de deploys (cada push a `main` redeploya). Leer velas desde un checkpoint garantiza detectar mechas y cierres aunque el server estuviera caído.
- **Nada se pierde en silencio**: borrar un bloque no se lleva sus alertas, y un perpetuo deslistado genera una tarjeta.
- **Coste casi nulo en Binance**: una petición por símbolo y tick, una al día para el catálogo y como máximo una por minuto para el precio del modal, con independencia del número de usuarios.
- **Nada se cierra solo**: la tarjeta es persistente y requiere acción.
- **Bandeja genérica**: la tabla `notifications` admite otros tipos en el futuro.

### Qué mide cada vela

- **Perpetuos cripto**: van casi pegados al spot. En cascadas de liquidaciones pueden hacer mechas algo más largas, así que un toque puede llegar antes que en spot. Para un recordatorio no es un problema, y las invalidaciones van por cierre.
- **TradFi**: el perpetuo no es el instrumento de la bolsa. `XAUUSDT` no es el GC de CME ni `CLUSDT` el CL de NYMEX: el análisis debe dibujarse sobre el mismo instrumento que vigila la alerta (en TradingView, `BINANCE:XAUUSDT.P`), o los niveles no van a cuadrar exacto.
- **Acciones**: el perpetuo cotiza 24/7 aunque la bolsa esté cerrada, así que una mecha de fin de semana puede tocar un nivel que la acción nunca tocó. El cierre diario filtra esas mechas, aunque el cierre de Binance (00:00 UTC) no coincide con el de Nasdaq. El modal lo advierte para los símbolos TradFi (§5.1).

---

## 2. Modelo de datos

Nuevo archivo: `database/028_migration_price_alerts_and_reminders.sql` (idempotente).

```sql
BEGIN;

-- 1. Catálogo de perpetuos + checkpoint de vigilancia.
--    Global (los símbolos son datos públicos). Lo llena el sync diario de exchangeInfo (§3.5).
--    Estar en el catálogo NO implica vigilancia: el job solo consulta símbolos con alertas activas.
CREATE TABLE IF NOT EXISTS market_symbols (
  symbol         VARCHAR(30) PRIMARY KEY,          -- 'BTCUSDT', 'XAUUSDT', 'NVDAUSDT'
  contract_type  VARCHAR(20) NOT NULL,             -- 'PERPETUAL' (cripto) | 'TRADIFI_PERPETUAL'
  base_asset     VARCHAR(20) NOT NULL,             -- 'BTC'
  quote_asset    VARCHAR(20) NOT NULL,             -- 'USDT'
  tick_size      NUMERIC(24, 12) NOT NULL,         -- PRICE_FILTER.tickSize: step del input de precio
  checked_until  TIMESTAMPTZ,                      -- openTime de la última vela vista (aún abierta); NULL = nunca vigilado
  last_price     NUMERIC(24, 8),                   -- close de la última vela leída por el job
  last_price_at  TIMESTAMPTZ,
  invalid_at     TIMESTAMPTZ,                      -- dejó de estar en TRADING (deslistado); NULL = vigente
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Alertas de precio
CREATE TABLE IF NOT EXISTS price_alerts (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  note_id           INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  block_id          INTEGER REFERENCES note_blocks(id) ON DELETE CASCADE,
  symbol            VARCHAR(30) NOT NULL REFERENCES market_symbols(symbol),
  direction         VARCHAR(5) NOT NULL CHECK (direction IN ('above', 'below')),
  target_price      NUMERIC(24, 8) NOT NULL CHECK (target_price > 0),
  is_invalidation   BOOLEAN NOT NULL DEFAULT FALSE,  -- FALSE: salta por toque; TRUE: solo por cierre diario
  near_pct          NUMERIC(5, 2) CHECK (near_pct IS NULL OR (near_pct > 0 AND near_pct <= 50)),
  deadline_at       TIMESTAMPTZ,                     -- fecha límite opcional; se pone a NULL al avisar
  price_at_creation NUMERIC(24, 8),                  -- lo pone el servidor desde la caché de precios; NULL si no había precio
  message           VARCHAR(500),                    -- "objetivo", "invalidación", ...
  status            VARCHAR(10) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'triggered')),
  armed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- creación o último re-armado
  near_at           TIMESTAMPTZ,                     -- se emitió (u omitió) el aviso de cercanía de este armado
  triggered_at      TIMESTAMPTZ,                     -- openTime de la vela que disparó
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT price_alerts_one_anchor CHECK (num_nonnulls(note_id, block_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_active_symbol
  ON price_alerts (symbol) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_price_alerts_deadline
  ON price_alerts (deadline_at) WHERE status = 'active' AND deadline_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_alerts_block ON price_alerts (block_id) WHERE block_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_alerts_note  ON price_alerts (note_id)  WHERE note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_status ON price_alerts (user_id, status);

-- 3. Recordatorios por fecha
CREATE TABLE IF NOT EXISTS date_reminders (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  note_id     INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  block_id    INTEGER REFERENCES note_blocks(id) ON DELETE CASCADE,
  remind_at   TIMESTAMPTZ NOT NULL,
  message     VARCHAR(500),
  status      VARCHAR(10) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent')),
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT date_reminders_one_anchor CHECK (num_nonnulls(note_id, block_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_date_reminders_due
  ON date_reminders (remind_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_date_reminders_block ON date_reminders (block_id) WHERE block_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_date_reminders_note  ON date_reminders (note_id)  WHERE note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_date_reminders_user_status ON date_reminders (user_id, status);

-- 4. Bandeja (genérica)
CREATE TABLE IF NOT EXISTS notifications (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  type             VARCHAR(30) NOT NULL,           -- ver §3.6
  price_alert_id   INTEGER REFERENCES price_alerts(id) ON DELETE SET NULL,
  date_reminder_id INTEGER REFERENCES date_reminders(id) ON DELETE SET NULL,
  payload          JSONB NOT NULL,                 -- foto del momento (§3.6)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,                    -- NULL = tarjeta abierta
  resolution       VARCHAR(20) CHECK (resolution IN ('dismissed', 'rearmed', 'updated'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_open
  ON notifications (user_id, created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_resolved
  ON notifications (user_id, resolved_at DESC) WHERE resolved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_open_alert
  ON notifications (price_alert_id) WHERE resolved_at IS NULL AND price_alert_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_open_reminder
  ON notifications (date_reminder_id) WHERE resolved_at IS NULL AND date_reminder_id IS NOT NULL;

-- 5. Estado del job (una sola fila)
CREATE TABLE IF NOT EXISTS reminder_job_state (
  id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run_at       TIMESTAMPTZ,                   -- inicio del último tick
  catalog_synced_at TIMESTAMPTZ,                   -- último sync correcto de exchangeInfo
  backoff_until     TIMESTAMPTZ,                   -- 429/418: no llamar a Binance antes de esta fecha
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO reminder_job_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 6. Al borrar un bloque, sus alertas y recordatorios pasan a la nota.
--    Si la nota ya no existe (purga), no se re-ancla y actúa el CASCADE.
CREATE OR REPLACE FUNCTION reanchor_block_reminders()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM notes WHERE id = OLD.note_id) THEN
    UPDATE price_alerts   SET note_id = OLD.note_id, block_id = NULL WHERE block_id = OLD.id;
    UPDATE date_reminders SET note_id = OLD.note_id, block_id = NULL WHERE block_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS note_blocks_reanchor_reminders ON note_blocks;
CREATE TRIGGER note_blocks_reanchor_reminders
  BEFORE DELETE ON note_blocks FOR EACH ROW EXECUTE FUNCTION reanchor_block_reminders();

-- 7. updated_at automático
DROP TRIGGER IF EXISTS update_market_symbols_updated_at ON market_symbols;
CREATE TRIGGER update_market_symbols_updated_at
  BEFORE UPDATE ON market_symbols FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_price_alerts_updated_at ON price_alerts;
CREATE TRIGGER update_price_alerts_updated_at
  BEFORE UPDATE ON price_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_date_reminders_updated_at ON date_reminders;
CREATE TRIGGER update_date_reminders_updated_at
  BEFORE UPDATE ON date_reminders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reminder_job_state_updated_at ON reminder_job_state;
CREATE TRIGGER update_reminder_job_state_updated_at
  BEFORE UPDATE ON reminder_job_state FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
```

### Notas del modelo

- **`TIMESTAMPTZ`** en las columnas que se comparan con los `openTime` de Binance (epoch ms, UTC) o con fechas elegidas por el usuario. El resto sigue la convención de las tablas vecinas.
- **`price_alerts.symbol REFERENCES market_symbols`**: no puede existir una alerta sobre un símbolo que no esté en el catálogo. El sync nunca borra filas; solo marca `invalid_at`.
- **Anclaje bloque XOR nota**: en alertas de bloque la nota se obtiene por join, así que `move-to-note` no desincroniza nada.
- **Re-anclaje por trigger** (punto 6 de la migración): cubre cualquier camino de borrado de bloques (editor, borrado múltiple), no solo un service. Al purgar una nota, la nota ya no existe cuando se borran sus bloques, así que no se re-ancla y el CASCADE borra todo. Asume que `note_blocks` tiene `note_id`.
- **`is_invalidation` decide el disparo**: no hay un campo "disparo" aparte. Un recordatorio normal salta por toque; uno marcado como invalidación, solo por cierre diario. El cierre semanal queda fuera de alcance (§7).
- **No existe estado `dismissed` en la alerta**: cancelar una alerta es borrarla. Lo que se descarta es la tarjeta (`notifications.resolution`).
- **`deadline_at` se consume**: al emitir la tarjeta de fecha límite se pone a NULL en la misma transacción (la fecha queda en el payload). "Extender fecha" pone una nueva.
- **`near_at` también marca un aviso omitido**: si al crear la alerta el precio ya está dentro de la banda de cercanía, el service rellena `near_at` para no avisar de algo que el usuario ya ve (§3.7).
- **`ON DELETE SET NULL` en `notifications`**: borrar una alerta o un recordatorio no borra sus tarjetas; se entienden igual gracias al `payload`.
- **`NUMERIC` llega como string**: `pg` devuelve `NUMERIC` como texto. Los repositories parsean `target_price`, `near_pct`, `last_price`, etc. a `Number` antes de devolverlos; nunca se comparan dos strings (`'60000' > '100000'` da `true`).

### Ciclo de vida

| Evento | Efecto |
|--------|--------|
| Bloque borrado | El trigger re-ancla sus alertas y recordatorios a la nota. Sus tarjetas quedan intactas. |
| Nota en papelera | Sus alertas no se evalúan, su fecha límite no se avisa y sus recordatorios no se envían (join con `notes.deleted_at IS NULL`). La purga los borra por CASCADE. |
| Nota restaurada | Las alertas vuelven a evaluarse desde el checkpoint del símbolo (puede saltar un toque ocurrido mientras estaba en la papelera; se acepta). Lo vencido mientras tanto se avisa en el siguiente tick. |
| Bloque movido a otra nota | Nada que hacer: la nota se deriva del bloque. |
| Re-armado | `status='active'`, `armed_at=NOW()`, `near_at=NULL`, `triggered_at=NULL`, nuevos `target_price`/`direction`/`is_invalidation`. Si la `deadline_at` ya venció y no se envía una nueva, pasa a NULL: si no, el siguiente tick la daría por vencida al momento. Ocurre cuando el toque llegó antes de la fecha pero se evaluó después (paso 8e). El modal no precarga una fecha límite vencida. Sus tarjetas abiertas se resuelven como `rearmed`. |
| Fecha límite vencida (alerta activa) | Se decide con las velas, cuando cierra la vela que contiene la fecha (paso 8e de §3.2). Sin toque antes de la fecha: tarjeta `price_alert_deadline`; `deadline_at = NULL`. La alerta sigue activa. Con toque antes de la fecha: solo la tarjeta del toque. En símbolos deslistados se compara con `NOW()` (paso 4). |
| Perpetuo deslistado | `market_symbols.invalid_at = NOW()` y una tarjeta `price_alert_delisted` por alerta activa. Sus alertas dejan de evaluarse; si el símbolo vuelve a `TRADING`, se retoma desde el checkpoint. |
| Recordatorio por fecha enviado | `status='sent'`, `sent_at=NOW()`. "Re-programar" lo vuelve a `pending` con otra fecha. |

---

## 3. Backend

### 3.1 Cliente de Binance — `src/clients/binanceFutures.js` (carpeta nueva)

Acceso a la API externa, análogo a lo que `repositories/` es para la BD. `fetch` nativo de Node (sin dependencias nuevas). Base URL: `config.binance.futuresApiUrl` (por defecto `https://fapi.binance.com`). Solo endpoints públicos de datos de mercado: sin API key.

Funciones:

```js
// Velas de 1h desde startTime (incluida la vela en curso, con su high/low parcial).
getHourlyKlines(symbol, startTimeMs, limit) // → [{ openTime, high, low, close }]

// Catálogo completo de contratos (sync diario).
getExchangeInfo() // → [{ symbol, contractType, status, baseAsset, quoteAsset, tickSize }]

// Último precio de todos los perpetuos (caché del modal).
getAllPrices() // → Map<symbol, { price, time }>
```

| Endpoint | Peso | Cuándo |
|----------|------|--------|
| `GET /fapi/v1/klines?symbol=X&interval=1h&startTime=<ms>&limit=<n>` | Según `limit`: 1 (<100), 2 (<500), 5 (≤1000) | Job: una por símbolo con alertas activas y tick |
| `GET /fapi/v1/exchangeInfo` | 1 | Sync del catálogo: una vez al día |
| `GET /fapi/v2/ticker/price` (sin `symbol`) | 2 | Caché de precios: como máximo una vez por minuto |

Responsabilidades del cliente (todas las llamadas pasan por aquí):

- **Leer `x-mbx-used-weight-1m`** de cada respuesta y exponerlo. Es el contador de peso de la IP en el minuto actual (límite de futuros: 2400).
- **Circuit breaker**: ante `429` o `418`, leer `Retry-After` (si no viene: 60 s para 429, 5 min para 418) y rechazar cualquier llamada hasta esa fecha sin tocar la red. Lanza `BinanceBackoffError` con la fecha. El cliente no toca la BD: expone `setBackoffUntil(date)` para que el service restaure al arrancar el valor de `reminder_job_state.backoff_until`, y el service persiste la fecha cuando captura el error.
- **Símbolo inválido** (`400` con código `-1121`): lanza `BinanceInvalidSymbolError`.
- **Timeout** de 10 s por petición (`AbortSignal.timeout`).
- Parsear los arrays de klines a objetos con `Number(...)` sobre los strings de precio.
- En `getExchangeInfo`, el `tickSize` sale del filtro `PRICE_FILTER`, nunca de `pricePrecision`: la documentación de Binance advierte que no es el tick.

### 3.2 Job — `startReminderJob()` en `server.js`

Un solo job para todo: alertas de precio, fechas límite, recordatorios por fecha y sync del catálogo. Corre **dentro del proceso del backend, en el mismo contenedor** (`tradelog-backend`), igual que la purga de notas; no hay contenedor ni worker aparte. Es viable porque el trabajo es casi todo espera de I/O y no bloquea el event loop; las pausas entre peticiones son `await` sobre timers. El estado vive en la BD (checkpoints, `reminder_job_state`), así que un reinicio no pierde nada. Si algún día el backend corre con varias réplicas, el advisory lock del paso 1 evita que dos procesos evalúen a la vez.

**Programación** (no `setInterval`): cadena de `setTimeout` cada `REMINDERS_TICK_MINUTES` (por defecto 30; `0` desactiva el job).

- Al arrancar se lee `last_run_at` y el primer tick se programa en `max(ahora + 1 min, last_run_at + intervalo)`.
- Así un deploy no genera peticiones extra (si el último tick fue hace 10 min, espera 20) y una racha de deploys seguidos no deja al job sin correr. Con `setInterval`, pushes cada 15–20 min lo dejarían horas sin tick, porque cada reinicio pone el contador a cero.

Cada tick (`reminderJob.service.js → runTick()`):

```
1. pg_try_advisory_lock(<REMINDERS_LOCK_CLASS>, 0) con un client dedicado.
   Forma de DOS enteros: withUserLock usa pg_advisory_xact_lock(userId) (un bigint)
   y los dos espacios de claves no se solapan. Si no se obtiene el lock → salir.
   Liberar con pg_advisory_unlock en finally.
2. UPDATE reminder_job_state SET last_run_at = NOW().
3. Recordatorios por fecha (sin Binance), en una transacción:
     pendientes con remind_at <= NOW() cuya nota no está borrada, FOR UPDATE
     → status = 'sent', sent_at = NOW() + INSERT tarjeta 'date_reminder_due'.
4. Fechas límite de símbolos deslistados (sin Binance), en una transacción:
     alertas activas con deadline_at <= NOW() cuya nota no está borrada y cuyo
     símbolo tiene invalid_at IS NOT NULL, FOR UPDATE
     → INSERT tarjeta 'price_alert_deadline' + deadline_at = NULL.
   Las fechas límite de símbolos válidos se evalúan con las velas (paso 8e).
5. Si backoff_until > NOW() → terminar el tick (lo que sigue necesita Binance).
6. Si catalog_synced_at es NULL o tiene más de 24 h → sync del catálogo (§3.5).
7. Símbolos a revisar:
     SELECT ms.* FROM market_symbols ms
     WHERE ms.invalid_at IS NULL
       AND EXISTS (alertas activas del símbolo cuya nota no está borrada)
   Sin filas → terminar sin pedir velas.
8. Por cada símbolo, EN SERIE y con 1 s de pausa entre peticiones:
   a. desde = checked_until (si fuera NULL: inicio de la hora actual).
   b. n = floor((ahora − desde) / 1 h) + 1; limit = min(n, 1000). Si n > 1000, paginar.
   c. velas = getHourlyKlines(symbol, desde, limit)
   d. Si usedWeight1m > BINANCE_MAX_USED_WEIGHT → procesar esta respuesta y cortar el bucle.
   e. En UNA transacción:
      - leer las alertas activas del símbolo (nota no borrada) con FOR UPDATE OF price_alerts:
        un PATCH concurrente (re-armado) espera a que termine la transacción, así que
        nunca se dispara una alerta con la evaluación de un objetivo viejo
      - evaluar cada alerta (§3.3) → UPDATE de la alerta + INSERT de la tarjeta
      - si la alerta tiene deadline_at, evaluar la fecha límite con la hora de las
        velas, no con NOW() (ver "Fecha límite" más abajo) → INSERT tarjeta
        'price_alert_deadline' + deadline_at = NULL, antes de la del toque o la cercanía
      - UPDATE market_symbols SET checked_until = openTime de la última vela,
                                  last_price    = close de la última vela,
                                  last_price_at = NOW()
9. Errores:
   - BinanceBackoffError → UPDATE reminder_job_state SET backoff_until = retryAfter
     (sobrevive a un reinicio). Cortar el tick.
   - BinanceInvalidSymbolError → mismo tratamiento que un deslistado del sync (§3.5).
   - Otro error (red, timeout) → log y seguir con el siguiente símbolo; el checkpoint no se movió.
```

El paso 3 va primero porque no depende de Binance: un backoff no retrasa un recordatorio por fecha. El paso 4 también corre antes de Binance, pero solo cubre los símbolos deslistados: sus velas ya no se leen, así que su fecha límite se compara con `NOW()`. El resto de fechas límite espera a que se lean las velas (paso 8e), también durante un backoff.

#### Fecha límite (paso 8e)

La fecha límite se compara con la hora de las velas, no con `NOW()`: hasta evaluar la vela que contiene la fecha no se sabe si el nivel se tocó antes. Si se comparara con `NOW()` antes de leer las velas, un toque anterior a la fecha que todavía no se había evaluado daría una tarjeta de fecha límite falsa ("no se tocó antes del…") junto a la del toque. Pasaba tras una caída o un backoff, y también sin caídas, con un toque en los ~30 min anteriores a la fecha.

Para cada alerta activa con `deadline_at`, después de evaluarla (`checked_until` es el nuevo checkpoint):

| Caso | Tarjetas |
|---|---|
| Toque en una vela con `openTime < deadline_at` | Solo la del toque; `deadline_at` no se toca. Con velas de 1 h no se sabe si un toque dentro de la vela de la fecha límite fue antes o después: cuenta como a tiempo. |
| Toque en una vela con `openTime >= deadline_at` | `price_alert_deadline` (+ `deadline_at = NULL`) y después la del toque. Las dos son ciertas: las velas anteriores ya se evaluaron sin toque. Vale aunque el checkpoint todavía no pase la fecha (fecha límite a las 12:00 en punto y toque en la vela de las 12:00, aún abierta). |
| Sin toque y `checked_until > deadline_at` (la vela que contiene la fecha ya cerró y se evaluó) | `price_alert_deadline` + `deadline_at = NULL`. La alerta sigue activa. Si en la misma pasada hay cercanía, salen las dos: primero la fecha límite. |
| Sin toque y `checked_until <= deadline_at` | Ninguna; se vuelve a mirar en el siguiente tick. |

Coste: la tarjeta de fecha límite llega hasta ~1 h más un tick después de la fecha, porque espera a que cierre la vela que la contiene.

#### Ejemplo: tick normal con varias alertas del mismo símbolo

Tres bloques con alertas de BTC. `checked_until` es el `openTime` de la vela que estaba abierta en la última consulta; se vuelve a pedir porque su high/low pudo crecer.

| Tick | Petición | Velas devueltas | Después |
|---|---|---|---|
| 14:10 | `startTime=14:00&limit=1` | 14:00 (abierta) | `checked_until = 14:00` |
| 14:40 | `startTime=14:00&limit=1` | 14:00 (abierta, high/low actualizados) | sin cambio |
| 15:10 | `startTime=14:00&limit=2` | 14:00 (cerrada, final) + 15:00 (abierta) | `checked_until = 15:00` |

Una petición de peso 1 por tick para BTC; las velas se evalúan en memoria contra las tres alertas. Re-evaluar la vela de las 14:00 no duplica avisos: las alertas disparadas ya no están activas y el aviso de cercanía exige `near_at IS NULL`.

#### Ejemplo: recuperación tras 8 h sin revisar

- Último tick bueno a las 02:10 → `checked_until = 02:00`.
- El backend está caído de 02:15 a 10:20. A las 05:30 BTC hace una mecha a 59,870 (alerta `below` 60,000).
- Al arrancar, `last_run_at + 30 min` ya venció → el primer tick corre a las 10:21 → `startTime=02:00&limit=9` → 9 velas (02:00 … 10:00) en **una** petición.
- La primera vela con `low <= 60000` es la de las 05:00 → `triggered_at = 05:00`. La tarjeta muestra "tocó 60,000 · 05:00–06:00", no la hora de detección.
- `checked_until = 10:00`.

Vale igual para cualquier causa de hueco (deploy, red, Binance caído, backoff por 429): el checkpoint solo avanza tras una consulta exitosa.

#### Ejemplo: invalidación por cierre diario

Alerta de invalidación `above` 110,000 con aviso previo del 3% (banda desde 106,700). Horas en UTC (Bogotá = UTC−5).

| Momento | Qué pasa |
|---|---|
| Mié 15:00 (10:00 Bogotá) | Mecha a 110,400. No dispara: no es una vela de cierre diario. Sí salta el aviso de cercanía, si no se había dado. |
| Mié 23:10 | El tick ve la vela de las 23:00 abierta: su cierre todavía no cuenta. |
| Jue 00:10 (Mié 19:10 Bogotá) | La vela de las 23:00 cerró en 107,800 → no dispara. |
| Vie 00:10 (Jue 19:10 Bogotá) | La vela de las 23:00 del jueves cerró en 110,600 → tarjeta "Tesis invalidada", `triggered_at` = jueves 23:00. |

### 3.3 Evaluación de velas — función pura

`evaluateAlert(alert, candles, nowMs) → { near: candle | null, hit: candle | null }`. Es la pieza crítica y se testea aislada con Jest (`nowMs` como parámetro para que los tests no dependan del reloj).

Reglas comunes:

- **Velas anteriores al armado** (`openTime + 1h <= armed_at`): se ignoran.
- **Vela del armado** (la que contiene `armed_at`): su `high`/`low` puede venir de antes de crear la alerta, así que en esa vela **solo se compara el `close`**. Se acepta perder un toque que ocurra y se revierta dentro de esa misma hora.
- **Cercanía** (solo si `near_pct` no es NULL y `near_at` es NULL), siempre por toque, también en invalidaciones: `above` → `high >= target × (1 − near_pct/100)`; `below` → `low <= target × (1 + near_pct/100)`.
- **Disparo y cercanía en la misma pasada**: solo se emite la tarjeta del disparo (y se rellena `near_at` para no emitir la de cercanía después).
- Una vez emitido el aviso de cercanía no se repite aunque el precio se aleje y vuelva; solo se rearma al re-armar la alerta.

Disparo según el tipo de alerta:

| | Recordatorio normal (`is_invalidation = false`) | Invalidación (`is_invalidation = true`) |
|---|---|---|
| Velas que cuentan | Todas las posteriores al armado (en la del armado, solo el `close`) | Solo las de **23:00 UTC ya cerradas** (`openTime + 1h <= nowMs`): su `close` es el cierre diario de Binance |
| Condición `above` | `high >= target` | `close >= target` |
| Condición `below` | `low <= target` | `close <= target` |
| `triggered_at` | `openTime` de la primera vela que cumple | `openTime` de esa vela de 23:00 |

Una invalidación armada a las 23:30 UTC cuenta el cierre de las 00:00, porque la vela de las 23:00 cierra después del armado.

Casos de test mínimos:

- Toque por mecha en vela posterior.
- Vela del armado con mecha previa (no dispara) y con close más allá del objetivo (dispara).
- Cercanía sin toque; cercanía y toque en la misma vela.
- Catch-up con 48 velas tras una caída.
- Alerta con `near_at` ya relleno no repite.
- Invalidación: mecha más allá del nivel con cierre diario por debajo → no dispara, pero sí da el aviso de cercanía.
- Invalidación: vela de 23:00 todavía abierta con close más allá → no dispara.
- Invalidación: vela de 23:00 cerrada más allá → dispara con `triggered_at` = esa vela.
- Invalidación armada a las 23:30 UTC → cuenta el cierre de las 00:00.

### 3.4 Frecuencia

Fija: cada tick revisa todos los símbolos con alertas activas. Con 10 símbolos son 10 peticiones de peso 1 cada 30 min, frente a un límite de 2400 por minuto, así que una frecuencia adaptativa no aporta nada. Leer velas desde el checkpoint hace que un tick tardío o perdido no pierda toques ni cierres: solo los notifica más tarde. La latencia máxima de una tarjeta es un tick más el refresco del badge (§5.3).

### 3.5 Catálogo — sync diario

Lo ejecuta el paso 6 del tick, una vez cada 24 h, con una sola llamada a `getExchangeInfo()` (peso 1).

1. Quedarse con los contratos `status = 'TRADING'` y `contractType` en `PERPETUAL` o `TRADIFI_PERPETUAL`. Los TradFi (metales, energía, acciones, ETFs) tienen su propio tipo: filtrar solo `PERPETUAL` dejaría fuera el oro y todas las acciones. Los contratos trimestrales se ignoran.
2. **Salvaguarda**: si ese conjunto tiene menos del 50% de los símbolos vigentes del catálogo (y el catálogo no está vacío), no marcar nada, registrar un `logger.warn` y reintentar en el siguiente tick sin actualizar `catalog_synced_at`. Evita que un mantenimiento de Binance o una respuesta parcial llene las bandejas de tarjetas de deslistado.
3. Upsert de cada contrato (`symbol`, `contract_type`, `base_asset`, `quote_asset`, `tick_size`). Si tenía `invalid_at` y volvió a `TRADING`, `invalid_at = NULL`.
4. Símbolos vigentes del catálogo que ya no aparecen (deslistados: Binance los pasa a `SETTLING`, o desaparecen): `invalid_at = NOW()` y, en la misma transacción, una tarjeta `price_alert_delisted` por cada alerta activa de ese símbolo cuya nota no está borrada.
5. `catalog_synced_at = NOW()`.

El primer sync (catálogo vacío) solo inserta. Estar en el catálogo no genera peticiones: `checked_until` queda en NULL hasta que alguien crea una alerta.

### 3.6 Tarjetas: tipos y payload

| `type` | Cuándo | Referencia |
|---|---|---|
| `price_alert_near` | Aviso de cercanía | `price_alert_id` |
| `price_alert_hit` | Un recordatorio normal tocó su nivel | `price_alert_id` |
| `price_alert_invalidation` | Una invalidación cerró el día más allá del nivel | `price_alert_id` |
| `price_alert_deadline` | Venció la fecha límite sin disparo | `price_alert_id` |
| `price_alert_delisted` | El perpetuo dejó de cotizar | `price_alert_id` |
| `date_reminder_due` | Llegó la fecha de un recordatorio | `date_reminder_id` |

El payload es una foto tomada al crear la tarjeta, para que se entienda aunque luego se borre la nota, la alerta o el recordatorio:

```json
{
  "symbol": "BTCUSDT",
  "contract_type": "PERPETUAL",
  "direction": "above",
  "target_price": "110000",
  "is_invalidation": true,
  "near_pct": "3",
  "price_at_creation": "92350.12",
  "armed_at": "2026-11-20T15:42:00Z",
  "deadline_at": null,
  "candle_open_time": "2027-03-04T23:00:00Z",
  "candle_value": "110600.00",
  "last_price": "110480.00",
  "message": "invalidación del escenario bajista",
  "sibling_alerts": [{ "id": 88, "direction": "below", "target_price": "60000" }],
  "note_id": 123,
  "note_title": "Análisis macro BTC 2026",
  "block_id": 456,
  "block_excerpt": "Si pierde el soporte semanal de 74k, el siguiente nivel es la zona de 60k..."
}
```

- `candle_value`: el `high`/`low` que tocó (toque y cercanía) o el `close` del cierre diario (invalidación). En `price_alert_deadline` y `price_alert_delisted` los campos de vela van en `null`.
- `sibling_alerts`: solo en `price_alert_invalidation`. Las otras alertas activas del mismo anclaje en ese momento, para la acción "Borrar las demás alertas".
- `block_excerpt`: primeros ~280 caracteres del `content` del bloque, sin markdown. Para anclajes de nota, el del primer bloque de texto.
- Payload de `date_reminder_due`: `remind_at`, `message`, `note_id`, `note_title`, `block_id`, `block_excerpt`.

### 3.7 API

Siguiendo el patrón de 6 pasos de [`development/workflow.md`](../../development/workflow.md#cómo-añadir-un-endpoint-nuevo). Todos requieren `authenticate`; los de alertas, recordatorios y tarjetas filtran por `user_id`.

**Catálogo** — `routes/marketSymbol.routes.js` montado en `/api/market-symbols`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/market-symbols` | Catálogo vigente (`invalid_at IS NULL`). Primero los que el usuario usó en alertas (por uso más reciente), luego el resto alfabético. Incluye `contract_type`, `base_asset`, `quote_asset`, `tick_size`, `last_price`, `last_price_at`. Sin llamar a Binance. |
| `GET` | `/api/market-symbols/:symbol/price` | Precio en vivo desde la caché (§3.8): `{ price, as_of }`, o `{ price: null }` si no hay. |

No hay alta de símbolos: el catálogo lo mantiene el sync (§3.5).

**Alertas de precio** — `routes/priceAlert.routes.js` montado en `/api/price-alerts`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/price-alerts` | Crear. Body: `{ block_id \| note_id, symbol, target_price, direction, is_invalidation?, near_pct?, deadline_at?, message? }` |
| `GET` | `/api/price-alerts?status=active\|triggered` | Listar con `last_price`, `last_price_at`, `distance_pct` y datos del anclaje (`note_id`, `note_title`, `block_id`, `block_excerpt`) para la pestaña Programadas. Sin llamar a Binance. |
| `PATCH` | `/api/price-alerts/:id` | Editar `target_price` / `direction` / `is_invalidation` / `near_pct` / `deadline_at` / `message`. Cambiar nivel, dirección o `is_invalidation` = re-armar. |
| `DELETE` | `/api/price-alerts/:id` | Borrar. Sus tarjetas abiertas se resuelven como `dismissed` en la misma transacción. |

Validación Joi (`validators/priceAlert.validator.js`): `xor('block_id', 'note_id')`; `symbol` en mayúsculas, `/^[A-Z0-9]{2,30}$/`; `target_price > 0`; `is_invalidation` booleano (default `false`); `near_pct` entre 0.1 y 50 o null; `deadline_at` fecha futura o null; mensajes en español.

Lógica de `create` en el service (**nunca llama a Binance directamente**):

1. Verificar que el bloque o la nota pertenecen al usuario y no están borrados.
2. El símbolo debe estar en el catálogo y sin `invalid_at` → si no, `ValidationError('Símbolo no disponible en Binance Futures')`.
3. `price_at_creation` = precio de la caché (§3.8); NULL si no hay.
4. Si ese precio ya está dentro de la banda de cercanía, `near_at = NOW()`: el aviso de este armado se da por omitido.
5. Si el símbolo no tiene alertas activas en notas no borradas (mismo criterio que el job): `checked_until` = inicio de la hora actual. No tiene sentido pedir historial anterior a la alerta nueva.
6. Insertar.

La `direction` viene del cliente: el modal la deduce del precio y el usuario la puede invertir.

`PATCH` resuelve en la misma transacción las tarjetas abiertas de la alerta que dejan de aplicar: todas como `rearmed` si cambió el nivel, la dirección o `is_invalidation`; las de tipo `price_alert_deadline` como `updated` si cambió `deadline_at`. Editar solo el mensaje o el aviso previo no toca las tarjetas. Un re-armado también aplica los pasos 3–5 de `create` con el nuevo nivel.

**Recordatorios por fecha** — `routes/dateReminder.routes.js` montado en `/api/date-reminders`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/date-reminders` | Crear. Body: `{ block_id \| note_id, remind_at, message? }` |
| `GET` | `/api/date-reminders?status=pending\|sent` | Listar con datos del anclaje, para la pestaña Programadas |
| `PATCH` | `/api/date-reminders/:id` | Editar `remind_at` / `message`. Una fecha nueva vuelve el recordatorio a `pending` (re-programar) y resuelve sus tarjetas abiertas como `rearmed`. |
| `DELETE` | `/api/date-reminders/:id` | Borrar. Sus tarjetas abiertas se resuelven como `dismissed`. |

Validación: `xor('block_id', 'note_id')`; `remind_at` al menos 1 minuto en el futuro; `message` hasta 500 caracteres.

**Tarjetas** — `routes/notification.routes.js` montado en `/api/notifications`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/notifications?status=open\|resolved&before=<id>` | Listar (abiertas: todas; resueltas: paginado por cursor, 50 por página) |
| `GET` | `/api/notifications/count` | `{ open }` para el badge |
| `POST` | `/api/notifications/:id/resolve` | Body `{ resolution: 'dismissed', delete_sibling_alerts?: boolean }`. Cerrar una tarjeta. |

`delete_sibling_alerts` solo es válido en tarjetas `price_alert_invalidation`: en la misma transacción borra las demás alertas activas del mismo anclaje (mismo `block_id`, o mismo `note_id` si es de nota). Los recordatorios por fecha del bloque se mantienen: siguen sirviendo para revisar.

El `GET /api/notes/:id` añade a cada bloque los campos `price_alerts` y `date_reminders` (subqueries `json_agg`, igual que `images` y `trades` en `note.repository.js → getById`), y a la nota sus alertas y recordatorios de nivel nota. Así los chips se pintan sin otra petición.

### 3.8 Caché de precios (modal)

`marketPrice.service.js`, en memoria del proceso:

- `getPrice(symbol)`: si la caché tiene más de 60 s, la refresca con `getAllPrices()`, **una sola** llamada sin símbolo (peso 2) para todos los perpetuos. Las peticiones concurrentes esperan la misma promesa (single-flight).
- Si el breaker está abierto, el peso usado supera `BINANCE_MAX_USED_WEIGHT` o la llamada falla, devuelve el último precio cacheado con su `as_of`; si no hay, el `last_price` del catálogo; si tampoco, `null` (el modal pide la dirección a mano).
- Resultado: la UI nunca genera más de una petición por minuto a Binance, con independencia del número de usuarios. El navegador no llama a Binance, así que no depende de CORS ni requiere cambios en la CSP.

### 3.9 Variables de entorno (`config/env.js`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `REMINDERS_TICK_MINUTES` | `30` | Intervalo del job. `0` = desactivado (útil en dev). |
| `BINANCE_FUTURES_API_URL` | `https://fapi.binance.com` | Base URL de datos de mercado de futuros USDⓈ-M. |
| `BINANCE_MAX_USED_WEIGHT` | `1200` | Si `x-mbx-used-weight-1m` lo supera, se corta el tick (el límite de futuros es 2400/min por IP). |

Documentar en [`operations/env-vars.md`](../../operations/env-vars.md).

---

## 4. Protección frente a bloqueos de Binance

La VPS comparte IP con market-tracker, que también consume datos de perpetuos. Un `418` (IP baneada, de 2 minutos hasta 3 días) afectaría a las dos apps, así que todas estas reglas son obligatorias:

1. **Sin alertas activas, cero peticiones de velas.** Solo corre el sync diario del catálogo (peso 1).
2. **Una petición por símbolo**, nunca por alerta ni por usuario.
3. **Solo velas nuevas**: desde `checked_until`, normalmente 1–2 velas (peso 1). Una caída larga se recupera con una sola petición (1000 velas de 1h = 41 días, peso 5).
4. **En serie, 1 s entre peticiones**: nunca ráfagas en paralelo.
5. **Leer el contador de la IP** (`x-mbx-used-weight-1m`) y cortar el tick si pasa `BINANCE_MAX_USED_WEIGHT`.
6. **429/418 → backoff persistido** en `reminder_job_state.backoff_until`, respetando `Retry-After`. Sobrevive a reinicios y lo respetan el job, el sync y la caché de precios.
7. **Deploys sin ráfagas**: el primer tick tras arrancar se programa desde `last_run_at` (§3.2).
8. **La UI genera como máximo una petición por minuto** (caché de precios, §3.8), con independencia del número de usuarios.

**Presupuesto**: con 10 símbolos vigilados son 480 peticiones de peso 1 al **día**, más 1 del sync y, mientras alguien usa el modal, 2 por minuto como máximo. El límite de futuros es 2400 por **minuto**.

### 4.1 Contador compartido con market-tracker

Binance limita por IP: el peso que consume market-tracker en futuros y el nuestro se suman, y `x-mbx-used-weight-1m` refleja el uso total. La regla 5 usa justo eso: si market-tracker está en un pico, TradeLog se aparta y reintenta en el siguiente tick (sin perder toques gracias al checkpoint).

Antes de activar el job en producción, conviene mirar desde la VPS cuánto peso suele usar market-tracker en futuros, para ajustar `BINANCE_MAX_USED_WEIGHT`:

```bash
curl -s -D - -o /dev/null "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=1" \
  | grep -i x-mbx-used-weight-1m
```

### 4.2 Errores del job visibles

Si el job falla de forma repetida (p. ej. backoff largo o red caída), se registra con `logger.error`. No genera tarjetas para no llenar la bandeja de ruido; la única tarjeta de error es la de perpetuo deslistado, porque requiere una acción del usuario.

---

## 5. Frontend

### 5.1 En el editor de notas

- **`components/notes/BlockReminderToggle.jsx`** (icono `BellRing`), junto a `BlockFollowUpToggle` y `BlockRevisitToggle` en `NoteBlockList.jsx`. Activo (relleno) si el bloque tiene alertas activas o recordatorios pendientes. Abre el modal.
- **Entrada en `BlockTouchMenu.jsx`** para el modo táctil.
- **`components/notes/ReminderModal.jsx`**: modal y no popover, porque en touch un popover con combobox y varios inputs queda apretado, y la app ya usa modales para acciones de bloque (`MoveBlockToNoteModal`). En pantallas chicas ocupa toda la pantalla. Tiene dos pestañas, **Precio** y **Fecha**, y sirve para crear, editar, re-armar y re-programar (desde la tarjeta, precargado).

```
┌─ Nuevo recordatorio ─────────────────────────────── ✕ ┐
│  [ Precio ]  [ Fecha ]                                │
│                                                       │
│ Símbolo        [ BTCUSDT                 Cripto ▾ ]   │
│ Precio actual  92,350.12 USDT · hace 20 s             │
│ Nivel          [ 110000          ]   +19.11 %         │
│ Dirección      ↑ Sube hasta              [invertir]   │
│ Aviso previo   [ 3 ] %                 ☐ sin aviso    │
│ ☑ Es una invalidación                                 │
│   Salta solo si una vela diaria cierra por encima     │
│   (cierre de Binance: 00:00 UTC · 19:00 hora local)   │
│ Fecha límite   [              ]         (opcional)    │
│ Mensaje        [ invalidación escenario bajista ]     │
│                                                       │
│ Recordatorios de este bloque                          │
│   🔔 BTCUSDT ↓ 60,000 · objetivo              ✎  🗑    │
│   📅 01/03/2027 08:00 · revisar tras el Q1    ✎  🗑    │
│                                                       │
│                      [Cancelar] [Crear recordatorio]  │
└───────────────────────────────────────────────────────┘
```

#### Pestaña Precio

- **Símbolo**: un combobox que filtra el catálogo (`GET /api/market-symbols`) por `symbol` y `base_asset` (escribir `sol` encuentra `SOLUSDT`), con una etiqueta **Cripto** o **TradFi** según `contract_type`. Al enfocarlo muestra primero los símbolos que el usuario ya usó. Por defecto viene el último usado (`localStorage` con try/catch). Navegable con teclado (flechas + Enter) y táctil. No hay "validar y agregar": si un símbolo no aparece, no existe como perpetuo.
- **Precio actual**: al elegir símbolo se pide `GET /api/market-symbols/:symbol/price` y se muestra con su antigüedad. Si no hay precio, se avisa y la dirección queda a elección manual.
- **Nivel**: input con `step = tick_size` y el % de distancia calculado al escribir.
- **Dirección**: deducida del precio actual (`nivel > precio` → `above`), invertible.
- **Aviso previo**: input `%` con default 3 y opción "sin aviso".
- **Es una invalidación**: checkbox, desmarcado por defecto. Desmarcado es un recordatorio normal, que salta por toque. Marcado salta solo por cierre diario; el texto de ayuda muestra la hora local equivalente al cierre de las 00:00 UTC.
- **Fecha límite**: opcional. Si llega sin que la alerta se haya disparado, aparece la tarjeta "¿sigue vigente?".
- **Mensaje**: opcional.
- **Avisos del modal**:
  - El nivel ya está cruzado → "El precio ya está del otro lado del nivel: saltará en el próximo chequeo".
  - El precio ya está dentro de la banda de aviso → "Ya estás dentro del aviso previo; no se enviará en este armado".
  - Símbolo TradFi → "Este perpetuo cotiza 24/7 y no es el instrumento de la bolsa: dibuja tu análisis sobre él (en TradingView, `BINANCE:<SÍMBOLO>.P`). En acciones, una mecha fuera de horario puede tocar el nivel."
- **Lista** de las alertas y recordatorios del bloque (o de la nota), con editar y borrar.

#### Pestaña Fecha

- **Fecha y hora**: por defecto las 08:00 locales del día elegido; se envía como `TIMESTAMPTZ` (UTC).
- **Mensaje**: opcional.

#### Chips — `components/notes/ReminderChip.jsx`

| Estado | Chip |
|---|---|
| Recordatorio de precio activo | `🔔 BTCUSDT ↓ 60,000 · −35%` (distancia con `last_price`) |
| Invalidación activa | `⛔ BTCUSDT ↑ 110,000 · cierre diario · +19%` |
| Recordatorio de precio disparado | ámbar: `⚡ tocado 02/03/2027` |
| Invalidación disparada | `⛔ invalidada 04/03/2027` |
| Recordatorio por fecha pendiente | `📅 01/03/2027` |

A nivel nota: el mismo botón y modal junto al título en `NoteEditor.jsx`; chips bajo el título.

### 5.2 Página `/recordatorios`

- **Header**: campana con badge del número de tarjetas abiertas, visible en toda el área de notas (añadir `/recordatorios` a `isNotesArea` en `Header.jsx`).
- **Pestañas**:
  - **Pendientes**: tarjetas abiertas, más recientes primero.
  - **Programadas**: todo lo armado, para consultar y administrar. Alertas activas ordenadas por distancia al nivel y recordatorios pendientes ordenados por fecha. Cada fila con editar, borrar e ir al análisis; filtro por símbolo.
  - **Historial**: tarjetas resueltas, paginado. Las de disparo muestran cuánto tardó (`triggered_at − armed_at`).
- **`components/notifications/NotificationCard.jsx`**, una variante por `type`:

```
┌──────────────────────────────────────────────────────┐
│ ⛔ Tesis invalidada · BTCUSDT cerró sobre 110,000     │
│ Cierre diario del 04/03/2027: 110,600                │
│ Armada hace 3 meses con BTC en 92,350 (+19.11%)      │
│ 📝 Análisis macro BTC 2026                           │
│ "Si pierde el soporte semanal de 74k, el siguiente…" │
│ 💬 invalidación escenario bajista                    │
│ El bloque tiene 1 alerta más activa: ↓ 60,000        │
│                                                      │
│ [Ver análisis] [Borrar las demás alertas] [Archivar] │
└──────────────────────────────────────────────────────┘
```

| Tipo | Color | Acciones |
|------|-------|----------|
| `price_alert_hit` | rojo/verde según dirección | Ver análisis · Re-armar en otro precio · Archivar |
| `price_alert_near` | ámbar | Ver análisis · Ajustar nivel · Entendido |
| `price_alert_invalidation` | morado | Ver análisis · Borrar las demás alertas (si hay) · Archivar |
| `price_alert_deadline` | azul | Ver análisis · Extender fecha · Borrar alerta · Mantener sin fecha |
| `price_alert_delisted` | gris | Ver análisis · Archivar |
| `date_reminder_due` | azul | Ver análisis · Re-programar · Archivar |

- **Ver análisis** navega a `/notes/:noteId?highlight=:blockId` (deep-link existente) y **no cierra** la tarjeta.
- **Archivar / Entendido / Mantener sin fecha** → `POST /resolve` con `dismissed`.
- **Borrar las demás alertas** → `POST /resolve` con `dismissed` y `delete_sibling_alerts: true`.
- **Re-armar / Ajustar nivel / Extender fecha / Re-programar** abren el modal precargado; al guardar, el backend resuelve la tarjeta (`rearmed` o `updated`).
- **Borrar alerta** → `DELETE /api/price-alerts/:id` (el backend resuelve sus tarjetas abiertas).
- La tarjeta de cercanía de una invalidación explica que falta el cierre: "BTCUSDT llegó a 110,400 · invalidación en 110,000: salta solo si cierra el día por encima".
- Si la alerta, el recordatorio o la nota ya no existen, se ocultan las acciones que los necesitan y la tarjeta se muestra solo con el payload.

### 5.3 Hooks y datos

- `hooks/useMarketSymbols.js`: `marketSymbolKeys`, `useMarketSymbols()` (`staleTime` 10 min: el catálogo casi no cambia) y `useSymbolPrice(symbol)` (`staleTime` 30 s, solo con el modal abierto y un símbolo elegido).
- `hooks/usePriceAlerts.js`: `priceAlertKeys`, `usePriceAlerts(status)`, `useCreatePriceAlert`, `useUpdatePriceAlert`, `useDeletePriceAlert`. Invalidan la nota afectada, `notificationKeys` y las listas de Programadas.
- `hooks/useDateReminders.js`: `dateReminderKeys`, `useDateReminders(status)` y sus mutaciones, con las mismas invalidaciones.
- `hooks/useNotifications.js`: `notificationKeys`, `useNotifications(status)`, `useNotificationCount()` con `refetchInterval: 5 * 60_000` y `refetchOnWindowFocus: true` (solo esta query; contra nuestra API, no Binance), `useResolveNotification()`.
- `api/endpoints.js`: funciones para los 13 endpoints nuevos.

---

## 6. Plan de implementación

1. Migración `028_migration_price_alerts_and_reminders.sql` y aplicarla en dev. Probar el trigger de re-anclaje: borrar un bloque con alertas (pasan a la nota) y purgar una nota (se borran).
2. `clients/binanceFutures.js` con circuit breaker y tests (fetch mockeado: 200, 429 con y sin `Retry-After`, 418, 400 `-1121`, lectura del header de peso).
3. `evaluateAlert` como función pura, con los tests de §3.3.
4. Repositories: `marketSymbol`, `priceAlert`, `dateReminder`, `notification`, `reminderJobState` (con el parseo de `NUMERIC`).
5. Services: sync del catálogo (§3.5), caché de precios (§3.8), CRUD de alertas y de recordatorios por fecha, `runTick()` (§3.2), resolución de tarjetas (con `delete_sibling_alerts`).
6. Controllers, validators, routes; montar en `server.js` junto a `startReminderJob()`.
7. `price_alerts` y `date_reminders` en la respuesta de `GET /api/notes/:id`.
8. Frontend: endpoints y hooks.
9. `ReminderModal` (pestañas, combobox, checkbox de invalidación, fecha límite, avisos), toggle y chips en bloques; luego a nivel nota.
10. Página `/recordatorios` (Pendientes, Programadas, Historial), tarjetas y campana con badge.
11. Mirar el peso habitual de market-tracker en futuros (§4.1) y ajustar `BINANCE_MAX_USED_WEIGHT` antes de activar `REMINDERS_TICK_MINUTES` en prod.
12. Docs: `api/reference.md`, `architecture/database.md`, `operations/env-vars.md`, roadmap (quitar "alertas de precio aplazadas hasta Market Tracker v2") y README de specs.

**Tasks**: el plan está desglosado en las tasks 016–026 de [`docs/tasks/`](../../tasks/).

**Esfuerzo estimado**: 4–5 días.

---

## 7. Fuera de alcance (posibles extensiones)

- **Cierre semanal** (u otros timeframes) para invalidaciones: sale de las mismas velas de 1h (cierre de la vela del domingo a las 23:00 UTC).
- **Spot** (tokens sin perpetuo): requiere una columna `venue` en el catálogo y en las alertas (migración pequeña).
- **Velas del índice** (`indexPriceKlines`) en lugar de las del perpetuo para TradFi: sin mechas de liquidaciones. Antes hay que ver qué hace el índice con la bolsa cerrada.
- Alertas por **zona** (rango de precios) o por **% de variación**.
- Recordatorios por fecha **recurrentes**.
- Autocompletar el símbolo leyendo el texto del bloque.
- Canales externos (Telegram, nesX Alerts): serían un envío adicional que lee de `notifications` sin resolver las tarjetas. Web Push ya tiene spec propia: [`notificaciones-push-pwa.md`](notificaciones-push-pwa.md).

---

## 8. Valores por defecto revisables

- Tick: **30 min**.
- Aviso de cercanía: **3%**.
- Hora por defecto de los recordatorios por fecha: **08:00** locales.
- `BINANCE_MAX_USED_WEIGHT`: **1200**, a ajustar según el peso habitual de market-tracker (§4.1).
- Caché de precios del modal: **60 s**.
- Salvaguarda del sync: no marcar deslistados si llega menos del **50%** de los símbolos vigentes.
- Backoff sin `Retry-After`: **60 s** (429) / **5 min** (418).

---

## 9. Cambios respecto al borrador anterior

- **Mercado**: de Binance spot a perpetuos USDⓈ-M (cripto + TradFi), sin columna `venue`.
- **Catálogo**: la validación símbolo a símbolo (con caché negativa y `POST /api/market-symbols`) pasa a ser un sync diario de `exchangeInfo`, con salvaguarda y detección de deslistados.
- **Precio en vivo**: del navegador a una caché en el backend; sin cambios de CORS ni CSP. `price_at_creation` lo pone el servidor y admite NULL.
- **Frecuencia**: se eliminan la frecuencia adaptativa y `next_check_at`. Tick fijo con estado persistido (`last_run_at`, `catalog_synced_at`, `backoff_until`).
- **Arranque**: cadena de `setTimeout` programada desde `last_run_at` en lugar de `setInterval` sin pasada inicial, que con deploys seguidos dejaba al job sin correr.
- **Concurrencia**: las alertas se leen con `FOR UPDATE` en la transacción del tick, para que un re-armado concurrente no quede disparado con el objetivo viejo.
- **Borrado de bloques**: las alertas y recordatorios suben a la nota (trigger) en vez de borrarse en silencio.
- **Invalidaciones**: `is_invalidation` hace que la alerta salte por cierre diario; tarjeta propia con "Borrar las demás alertas".
- **Nuevo**: recordatorios por fecha, fecha límite opcional, pestaña Programadas y avisos en el modal.
- **Renombres**: `/notificaciones` → `/recordatorios`; `price_alert_invalid` → `price_alert_delisted`; `PRICE_ALERTS_TICK_MINUTES` → `REMINDERS_TICK_MINUTES`; `BINANCE_API_URL` → `BINANCE_FUTURES_API_URL`; `PriceAlertModal` → `ReminderModal`.