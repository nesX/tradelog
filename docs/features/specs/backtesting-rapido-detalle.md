# Implementación: Módulo de Backtesting Rápido

## Contexto del proyecto

Trading Journal full-stack existente y funcional. Stack: React 18 + Vite (frontend), Express.js (backend), PostgreSQL (base de datos). Arquitectura: `routes → middleware → controllers → services → repositories → database`. Ambos lados usan ES modules (`"type": "module"`). Backend en puerto 5000, frontend en 5173.

**Este módulo es completamente independiente** del journal de trades y de las estadísticas existentes. No comparte datos, no afecta ningún flujo existente, no aparece en estadísticas del journal principal.

---

## Qué se va a implementar

Un sistema de registro rápido de sesiones de backtesting. El usuario crea una sesión, registra el contexto (símbolo, fecha del período histórico, timeframe, estado anímico), y dentro de la sesión va registrando trades con un click + comentario obligatorio. Las sesiones pueden ser continuación de otra sesión anterior. Todo el módulo existe para generar un historial de comentarios y decisiones que luego se pueda analizar con IA.

---

## Modelo de datos — nuevas tablas exclusivas del módulo

### `backtest_sessions`

```sql
CREATE TABLE backtest_sessions (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id),
  symbol                VARCHAR(20) NOT NULL,
  timeframe             VARCHAR(10) NOT NULL,         -- ej: "1m", "5m", "1h", "4h"
  period_date           DATE NOT NULL,                -- fecha del período histórico que se está revisando
  
  -- Estado anímico al inicio
  mood_start_score      SMALLINT NOT NULL CHECK (mood_start_score BETWEEN 1 AND 5),
  mood_start_comment    TEXT,                         -- opcional
  
  -- Estado anímico al cierre (se llena al cerrar la sesión)
  mood_end_score        SMALLINT CHECK (mood_end_score BETWEEN 1 AND 5),
  mood_end_comment      TEXT,                         -- opcional
  
  -- Comentario de cierre obligatorio al cerrar
  closing_comment       TEXT,
  closed_at             TIMESTAMP,                   -- null = sesión activa
  
  -- Relación de continuación
  parent_session_id     INTEGER REFERENCES backtest_sessions(id) ON DELETE SET NULL,
  
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Reglas importantes:**
- `closed_at` NULL significa sesión activa. Solo puede haber múltiples sesiones activas por usuario (no se restringe).
- Una sesión está "cerrada" cuando tiene `closed_at`, `closing_comment`, `mood_end_score`.
- `parent_session_id` es la referencia a la sesión que esta continúa.

---

### `backtest_trades`

```sql
CREATE TABLE backtest_trades (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES backtest_sessions(id) ON DELETE CASCADE,
  result      VARCHAR(20) NOT NULL CHECK (result IN ('long_win', 'long_loss', 'short_win', 'short_loss', 'break_even')),
  comment     TEXT NOT NULL,   -- OBLIGATORIO, no puede estar vacío
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### Índices

```sql
CREATE INDEX idx_backtest_sessions_user_id ON backtest_sessions(user_id);
CREATE INDEX idx_backtest_sessions_parent ON backtest_sessions(parent_session_id);
CREATE INDEX idx_backtest_sessions_closed ON backtest_sessions(closed_at);
CREATE INDEX idx_backtest_trades_session_id ON backtest_trades(session_id);
```

### Trigger para updated_at en backtest_sessions

```sql
CREATE TRIGGER update_backtest_sessions_updated_at
  BEFORE UPDATE ON backtest_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- La función update_updated_at_column() ya existe en el proyecto (triggers.sql)
```

Crear archivo: `database/migration_backtesting.sql` con todo el DDL anterior en orden.

---

## Backend — archivos nuevos

### Estructura de archivos a crear

```
backend/src/
  repositories/backtest.repository.js
  services/backtest.service.js
  controllers/backtest.controller.js
  routes/backtest.routes.js
  validators/backtest.validator.js
```

---

### `src/validators/backtest.validator.js`

Schemas Joi para validar los requests:

**Crear sesión:**
- `symbol`: string, requerido, max 20 chars, uppercase
- `timeframe`: string, requerido, opciones: '1S','5S','10S','30S','1m','2m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w'
- `period_date`: date, requerido
- `mood_start_score`: number, entero, entre 1 y 5, requerido
- `mood_start_comment`: string, opcional, max 1000 chars
- `parent_session_id`: number, entero, opcional

**Cerrar sesión (PATCH /:id/close):**
- `mood_end_score`: number, entero, entre 1 y 5, requerido
- `mood_end_comment`: string, opcional, max 1000 chars
- `closing_comment`: string, requerido, no vacío

**Agregar trade:**
- `result`: string, requerido, valores permitidos: 'long_win', 'long_loss', 'short_win', 'short_loss', 'break_even'
- `comment`: string, requerido, no vacío, max 2000 chars

---

### `src/repositories/backtest.repository.js`

Queries SQL parametrizadas. Métodos necesarios:

```js
// Sesiones
findAllByUser(userId)           // lista todas las sesiones del usuario con contador de trades
findById(id, userId)            // sesión con sus trades
create(data)                    // insertar sesión nueva
closeSession(id, userId, data)  // actualizar mood_end, closing_comment, closed_at
findByIdRaw(id, userId)         // solo datos de la sesión sin trades (para precarga de continuación)

// Trades
addTrade(sessionId, data)       // insertar trade en sesión
deleteTrade(tradeId, sessionId) // eliminar trade (por si el usuario se equivoca)
```

**Query importante para `findAllByUser`** — debe traer por cada sesión:
- Todos los campos de `backtest_sessions`
- Nombre de la sesión padre si existe (JOIN a sí misma): `parent_session_id`, `parent.symbol`, `parent.period_date`
- Contadores: total de trades, cuántos de cada tipo (long_win, long_loss, short_win, short_loss, break_even)
- Calcular win_rate: (long_win + short_win) / total * 100

Ejemplo de la query de lista:
```sql
SELECT 
  s.*,
  p.symbol AS parent_symbol,
  p.period_date AS parent_period_date,
  COUNT(t.id) AS total_trades,
  COUNT(t.id) FILTER (WHERE t.result = 'long_win') AS long_wins,
  COUNT(t.id) FILTER (WHERE t.result = 'long_loss') AS long_losses,
  COUNT(t.id) FILTER (WHERE t.result = 'short_win') AS short_wins,
  COUNT(t.id) FILTER (WHERE t.result = 'short_loss') AS short_losses,
  COUNT(t.id) FILTER (WHERE t.result = 'break_even') AS break_evens,
  ROUND(
    COUNT(t.id) FILTER (WHERE t.result IN ('long_win', 'short_win'))::numeric /
    NULLIF(COUNT(t.id), 0) * 100, 1
  ) AS win_rate
FROM backtest_sessions s
LEFT JOIN backtest_sessions p ON s.parent_session_id = p.id
LEFT JOIN backtest_trades t ON t.session_id = s.id
WHERE s.user_id = $1
GROUP BY s.id, p.symbol, p.period_date
ORDER BY s.created_at DESC
```

---

### `src/services/backtest.service.js`

Lógica de negocio:

**createSession(userId, data):**
- Si viene `parent_session_id`, verificar que esa sesión pertenece al mismo usuario. Si no pertenece → error 403.
- Si viene `parent_session_id`, verificar que la sesión padre esté cerrada (`closed_at` no null). Si está activa → error 400 con mensaje "Debes cerrar la sesión anterior antes de crear una continuación".
- Insertar la sesión nueva.

**closeSession(userId, sessionId, data):**
- Verificar que la sesión existe y pertenece al usuario.
- Verificar que `closed_at` sea null (no está ya cerrada). Si ya está cerrada → error 400.
- Actualizar con `closed_at = NOW()`, `mood_end_score`, `mood_end_comment`, `closing_comment`.

**addTrade(userId, sessionId, data):**
- Verificar que la sesión existe y pertenece al usuario.
- Verificar que la sesión esté activa (`closed_at` es null). Si está cerrada → error 400 con mensaje "No puedes agregar trades a una sesión cerrada".
- Insertar el trade.

**deleteTrade(userId, tradeId):**
- Verificar que el trade existe y que su sesión pertenece al usuario.
- Verificar que la sesión esté activa. Si está cerrada → error 400.
- Eliminar el trade.

**getSessionForContinuation(userId, sessionId):**
- Devuelve símbolo, timeframe y period_date de la sesión para precargar en el formulario de nueva sesión.

---

### `src/controllers/backtest.controller.js`

Controllers thin que delegan al service. Patrón idéntico a los controllers existentes en el proyecto.

---

### `src/routes/backtest.routes.js`

Todas las rutas requieren el middleware `authenticate` existente.

```
GET    /api/backtest/sessions                        → listar sesiones del usuario
POST   /api/backtest/sessions                        → crear sesión
GET    /api/backtest/sessions/:id                    → obtener sesión con sus trades
PATCH  /api/backtest/sessions/:id/close              → cerrar sesión
GET    /api/backtest/sessions/:id/continuation-data  → datos para precargar continuación

POST   /api/backtest/sessions/:id/trades             → agregar trade a sesión activa
DELETE /api/backtest/trades/:tradeId                 → eliminar trade
```

---

### `src/server.js`

Registrar las nuevas rutas:
```js
import backtestRoutes from './routes/backtest.routes.js'
app.use('/api/backtest', backtestRoutes)
```

---

## Shapes de respuesta de la API

### GET /api/backtest/sessions — lista

```json
{
  "success": true,
  "data": [
    {
      "id": 3,
      "symbol": "BTCUSDT",
      "timeframe": "1m",
      "period_date": "2024-11-15",
      "mood_start_score": 4,
      "mood_start_comment": "Descansado, enfocado",
      "mood_end_score": 3,
      "mood_end_comment": null,
      "closing_comment": "Buena sesión, proyecciones funcionaron bien",
      "closed_at": "2026-02-20T15:30:00Z",
      "parent_session_id": 2,
      "parent_symbol": "BTCUSDT",
      "parent_period_date": "2024-11-14",
      "is_continuation": true,
      "total_trades": 12,
      "long_wins": 4,
      "long_losses": 2,
      "short_wins": 3,
      "short_losses": 2,
      "break_evens": 1,
      "win_rate": 58.3,
      "created_at": "2026-02-20T10:00:00Z"
    }
  ]
}
```

### GET /api/backtest/sessions/:id — detalle con trades

```json
{
  "success": true,
  "data": {
    "id": 3,
    "symbol": "BTCUSDT",
    "timeframe": "1m",
    "period_date": "2024-11-15",
    "mood_start_score": 4,
    "mood_start_comment": "Descansado, enfocado",
    "mood_end_score": 3,
    "mood_end_comment": null,
    "closing_comment": "Buena sesión",
    "closed_at": "2026-02-20T15:30:00Z",
    "parent_session_id": 2,
    "is_continuation": true,
    "total_trades": 3,
    "long_wins": 1,
    "long_losses": 1,
    "short_wins": 1,
    "short_losses": 0,
    "break_evens": 0,
    "win_rate": 66.7,
    "trades": [
      {
        "id": 101,
        "result": "long_win",
        "comment": "Proyección clara, entrada limpia en el retroceso",
        "created_at": "2026-02-20T10:15:00Z"
      },
      {
        "id": 102,
        "result": "long_loss",
        "comment": "Entré antes de confirmación, impaciencia",
        "created_at": "2026-02-20T11:00:00Z"
      }
    ],
    "created_at": "2026-02-20T10:00:00Z"
  }
}
```

---

## Frontend — archivos nuevos y modificaciones

### Nuevas rutas en App.jsx

```
/backtest                → BacktestList.jsx  (lista de sesiones)
/backtest/new            → BacktestSession.jsx (crear sesión nueva)
/backtest/:id            → BacktestSession.jsx (sesión activa o ver detalle)
/backtest/:id/continue   → BacktestNew.jsx (crear continuación con datos precargados)
```

Todas dentro de `ProtectedRoute` existente.

---

### Nuevos archivos frontend

```
frontend/src/
  pages/
    Backtest.jsx              -- lista de sesiones
    BacktestSession.jsx       -- vista de sesión activa y detalle
  components/backtest/
    BacktestSessionCard.jsx   -- card en la lista
    BacktestTradeButton.jsx   -- los 5 botones de resultado
    BacktestTradeList.jsx     -- lista de trades dentro de sesión
    BacktestTradeItem.jsx     -- un trade individual
    BacktestMoodSelector.jsx  -- selector de escala 1-5 + comentario opcional
    BacktestCloseModal.jsx    -- modal para cerrar sesión
    BacktestNewSessionForm.jsx -- formulario crear sesión
  hooks/
    useBacktest.js            -- React Query hooks
  api/
    (agregar funciones en endpoints.js existente)
```

---

### `src/pages/Backtest.jsx` — Lista de sesiones

Vista principal del módulo. Muestra:

- Botón prominente "Nueva sesión" que lleva a `/backtest/new`
- Lista de sesiones ordenadas por fecha de creación descendente
- Cada card muestra:
  - Símbolo + Timeframe + Fecha del período
  - Badge "Continuación" si `is_continuation = true` con referencia visual a la sesión padre
  - Marcador: W/L/BE (ej: 7W · 3L · 1BE)
  - Win rate en porcentaje
  - Estado: badge "Activa" (verde) o fecha de cierre
  - Estado anímico inicio y fin como iconos o números simples
- Click en la card navega a `/backtest/:id`

---

### `src/pages/BacktestSession.jsx` — Sesión activa y detalle

Esta página sirve para dos usos: registrar trades en tiempo real (sesión activa) y ver el historial (sesión cerrada). Determina el modo según `closed_at`.

**Modo activo (sesión abierta):**

Header con símbolo, timeframe, fecha, estado anímico de inicio y marcador en tiempo real (se actualiza con cada trade registrado).

Sección central con los 5 botones grandes y bien diferenciados visualmente:
- **Long Win** — color verde
- **Long Loss** — color rojo
- **Short Win** — color azul/verde
- **Short Loss** — color naranja/rojo
- **Break Even** — color gris/amarillo

Al hacer click en cualquier botón se abre un modal o un área inline que muestra:
- El tipo seleccionado (ej: "Long Win")
- Textarea para el comentario — obligatorio, no puede enviarse vacío
- Botón confirmar / cancelar

Al confirmar, el trade se agrega a la lista de trades debajo y los contadores se actualizan inmediatamente (optimistic update con React Query).

Botón "Cerrar sesión" que abre `BacktestCloseModal.jsx`.

Listado de trades registrados en la sesión en orden cronológico, cada uno mostrando tipo (con badge de color), comentario y hora.

**Modo detalle (sesión cerrada):**

Misma estructura pero sin los botones de registro. Muestra estado anímico inicio y fin, comentario de cierre, y el listado completo de trades. Botón "Continuar sesión" que lleva a `/backtest/:id/continue`.

---

### `src/components/backtest/BacktestCloseModal.jsx`

Modal que aparece al presionar "Cerrar sesión". Contiene:
- Estado anímico final: `BacktestMoodSelector` (escala 1-5 obligatoria + comentario opcional)
- Textarea comentario de cierre — obligatorio, no puede estar vacío
- Botón "Cerrar sesión" — llama a PATCH /:id/close
- Botón cancelar

---

### `src/components/backtest/BacktestMoodSelector.jsx`

Componente reutilizable para seleccionar estado anímico. Muestra:
- 5 botones o círculos numerados del 1 al 5, visualmente diferenciados (rojo → amarillo → verde)
- Textarea opcional para comentario libre
- Se usa en el formulario de nueva sesión (inicio) y en el modal de cierre (fin)

---

### `src/pages/BacktestNew.jsx` — Formulario nueva sesión / continuación

Formulario para crear sesión. Si viene de una continuación (`/backtest/:id/continue`), primero hace GET a `/api/backtest/sessions/:id/continuation-data` y precarga los campos.

Campos:
- Símbolo — texto, uppercase automático
- Timeframe — select con opciones: 1S, 5S, 10S, 30S, 1m, 2m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w
- Fecha del período histórico — date picker
- Estado anímico inicial — `BacktestMoodSelector`
- Campo oculto `parent_session_id` si es continuación

Si es continuación, mostrar banner informativo: "Continuación de la sesión del [fecha] — [símbolo]"

Al guardar navega a `/backtest/:id` de la sesión recién creada.

---

### `src/hooks/useBacktest.js`

React Query hooks siguiendo el patrón de `useTrades.js` existente. Keys factory:

```js
export const backtestKeys = {
  all: ['backtest'],
  sessions: () => [...backtestKeys.all, 'sessions'],
  session: (id) => [...backtestKeys.all, 'sessions', id],
}
```

Hooks necesarios:
- `useSessions()` — GET lista
- `useSession(id)` — GET detalle
- `useCreateSession()` — POST, invalida lista al éxito
- `useCloseSession()` — PATCH close, invalida sesión y lista
- `useAddTrade(sessionId)` — POST trade, invalida sesión (actualiza contadores)
- `useDeleteTrade()` — DELETE trade, invalida sesión

Para `useAddTrade` implementar **optimistic update**: agregar el trade a la cache inmediatamente antes de que el servidor responda, revertir si hay error.

---

### `src/api/endpoints.js`

Agregar al archivo existente las funciones del módulo backtesting:

```js
// Backtest
export const getSessions = () => api.get('/backtest/sessions')
export const getSession = (id) => api.get(`/backtest/sessions/${id}`)
export const createSession = (data) => api.post('/backtest/sessions', data)
export const closeSession = (id, data) => api.patch(`/backtest/sessions/${id}/close`, data)
export const getContinuationData = (id) => api.get(`/backtest/sessions/${id}/continuation-data`)
export const addBacktestTrade = (sessionId, data) => api.post(`/backtest/sessions/${sessionId}/trades`, data)
export const deleteBacktestTrade = (tradeId) => api.delete(`/backtest/trades/${tradeId}`)
```

---

### `src/components/layout/Header.jsx`

Agregar enlace "Backtesting" en la navegación principal junto a los enlaces existentes (Home, Stats, etc.). Usar el mismo estilo visual que los enlaces actuales.

---

## Reglas de negocio que el backend debe enforcar

1. **Comentario de trade obligatorio** — si `comment` viene vacío o solo espacios → error 400.

2. **No agregar trades a sesión cerrada** — si `closed_at` no es null → error 400 con mensaje claro.

3. **Continuación solo de sesiones cerradas** — si `parent_session_id` apunta a una sesión activa → error 400 con mensaje "Cierra la sesión anterior antes de continuar".

4. **Propiedad de sesiones** — todas las operaciones verifican que la sesión pertenece al `user_id` del JWT. Un usuario no puede ver, modificar ni agregar trades a sesiones de otro usuario.

5. **Comentario de cierre obligatorio** — al cerrar sesión, si `closing_comment` viene vacío → error 400.

6. **Sesión ya cerrada** — si se intenta cerrar una sesión que ya tiene `closed_at` → error 400.

7. **Eliminar trade de sesión cerrada** — no permitido → error 400.

---

## Lo que NO debe cambiar

- El journal de trades existente no se toca en absoluto
- Las estadísticas actuales no incluyen datos de backtesting
- La autenticación, CSV import, upload de imágenes y todas las funciones actuales quedan intactas
- El estilo visual del módulo nuevo debe ser coherente con el diseño actual del proyecto (Tailwind, mismo esquema de colores, mismos componentes comunes como Button, Modal, Input, Toast)

---

## Orden de implementación recomendado

1. `database/migration_backtesting.sql` — ejecutar en la DB
2. `backtest.repository.js` — todas las queries
3. `backtest.service.js` — lógica de negocio con todas las validaciones
4. `backtest.controller.js` — thin controllers
5. `backtest.routes.js` — rutas con authenticate
6. Registrar rutas en `server.js`
7. Probar todos los endpoints con curl o Postman antes de tocar el frontend
8. Agregar funciones en `endpoints.js` del frontend
9. `useBacktest.js` — hooks de React Query
10. `BacktestMoodSelector.jsx` — componente base reutilizable
11. `BacktestNew.jsx` — formulario de creación
12. `BacktestSession.jsx` — vista de sesión activa y detalle
13. `BacktestCloseModal.jsx` — modal de cierre
14. `Backtest.jsx` — lista de sesiones
15. Agregar rutas en `App.jsx`
16. Agregar enlace en `Header.jsx`
17. Prueba end to end del flujo completo: crear → registrar trades → cerrar → crear continuación