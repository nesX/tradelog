# Arquitectura — Backend

Express 4 + ES Modules + Postgres (pg) + Joi + Winston + JWT + Google OAuth.

Punto de entrada: `trading-journal/backend/src/server.js`.

## Estructura de carpetas

```
trading-journal/backend/
├── src/
│   ├── server.js             # entry point: monta middlewares y rutas
│   ├── config/
│   │   ├── env.js            # variables validadas con Joi → export config
│   │   └── database.js       # pool pg (max 20), query/getClient helpers
│   ├── middleware/
│   │   ├── auth.js           # authenticate, optionalAuth (JWT)
│   │   ├── authorize.js      # authorize('admin', 'super_admin')
│   │   ├── errorHandler.js   # AppError + clases + middleware central
│   │   ├── validation.js     # validate(schema, 'body'|'query'|'params')
│   │   └── upload.js         # multer disk storage, file filter, handleMulterError
│   ├── routes/               # 7 routers, todos protegidos excepto auth/google y health
│   │   ├── auth.routes.js
│   │   ├── trade.routes.js
│   │   ├── stats.routes.js
│   │   ├── system.routes.js  # /api/systems + /api/timeframes
│   │   ├── backtest.routes.js
│   │   ├── note.routes.js
│   │   └── admin.routes.js
│   ├── controllers/          # 7 controllers, "thin"
│   ├── services/             # lógica de negocio (8 archivos)
│   ├── repositories/         # acceso a datos (5 archivos)
│   ├── validators/           # schemas Joi por dominio (6 archivos)
│   ├── models/
│   │   ├── trade.model.js    # constantes (TRADE_TYPES, STATUS, PAGINATION_DEFAULTS)
│   │   └── user.model.js
│   └── utils/
│       ├── logger.js         # Winston (consola + JSON a logs/)
│       ├── response.js       # sendSuccess, sendError, sendValidationError
│       └── fileUtils.js      # generateUniqueFilename, ensureDirectoryExists
├── tests/                    # Jest (cobertura mínima hoy)
├── uploads/                  # imágenes (volumen montado en prod)
├── logs/                     # Winston JSON (volumen montado en prod)
├── Dockerfile
├── package.json
└── .env.example
```

## Bootstrap (`server.js`)

Orden de inicialización:

1. `helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })` — el `cross-origin` es necesario para que el frontend pueda incrustar imágenes servidas desde `/api/images/*`.
2. `cors` con orígenes de `ALLOWED_ORIGINS` (env, coma-separado).
3. `express.json({ limit: '10mb' })` y `express.urlencoded`.
4. `app.use('/api/images', express.static(uploadsPath))` — sirve imágenes directamente.
5. Routers montados en orden:
   - `/api/auth` → `authRoutes`
   - `/api/trades` → `tradeRoutes`
   - `/api/stats` → `statsRoutes`
   - `/api` → `systemRoutes` (expone `/api/systems`, `/api/timeframes`)
   - `/api/backtest` → `backtestRoutes`
   - `/api/notes` → `noteRoutes`
   - `/api/admin` → `adminRoutes`
6. `GET /api/health` — siempre disponible, sin auth.
7. `notFoundHandler` + `errorHandler` al final.
8. `startServer()`: testConnection → mkdir uploads → `initSuperAdmin()` → `app.listen(config.port)`.
9. Manejo de `SIGTERM`/`SIGINT` para shutdown limpio. `unhandledRejection` se loguea; `uncaughtException` mata el proceso (sano).

## Capas en detalle

### 1. Routes

Definen URL → controller, con middlewares apilados:

```js
// trade.routes.js
router.use(authenticate);
router.post(
  '/',
  uploadTradeImages,        // multer.array('images', 10)
  handleMulterError,
  validate(createTradeSchema, 'body'),
  tradeController.createTrade
);
```

Orden importante: las rutas estáticas van **antes** de las dinámicas (`/symbols` antes de `/:id`, `/blocks/review` antes de `/blocks/:blockId`).

### 2. Controllers

Patrón consistente:

```js
export const listTrades = async (req, res) => {
  const result = await tradeService.listTrades(req.query, req.user.id);
  return sendSuccess(res, result);
};
```

No hay try/catch — `express-async-errors` propaga al `errorHandler`.

### 3. Services

Lógica de negocio. Ejemplo: `csvParser.service.js` (237 líneas) parsea filas, valida con Joi, normaliza fechas y números con coma decimal, devuelve `{ valid: [...], errors: [{ line, errors: [...] }] }`.

Servicios actuales y tamaño aproximado:

| Servicio | Líneas | Propósito |
|----------|--------|-----------|
| `trade.service.js` | ~244 | CRUD + filtros + paginación de trades |
| `note.service.js` | ~557 | Notas con jerarquía, bloques, DnD, tags, búsqueda |
| `stats.service.js` | ~220 | Agregaciones SQL: general, by-symbol, by-date, daily-pnl, by-type, top-trades |
| `csvParser.service.js` | ~237 | Parser flexible (fechas ISO o 'YYYY-MM-DD HH:mm', coma decimal) |
| `backtest.service.js` | ~223 | Sesiones de backtesting + trades virtuales |
| `auth.service.js` | ~126 | JWT issue/verify + Google ID token validation |
| `admin.service.js` | ~113 | CRUD de usuarios + bootstrap super_admin |
| `system.service.js` | ~63 | Trading systems + timeframes |

### 4. Repositories

**Único lugar** que ejecuta SQL. Patrón:

```js
import { query } from '../config/database.js';

export const findById = async (id, userId) => {
  const result = await query(
    `SELECT * FROM trades WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return result.rows[0] || null;
};
```

Todos los repos filtran por `user_id` para aislamiento multi-tenant blando.

### 5. Validators

Schemas Joi reutilizables. Ejemplo:

```js
// validators/trade.validator.js
export const createTradeSchema = Joi.object({
  symbol: Joi.string().uppercase().max(20).required(),
  trade_type: Joi.string().valid('LONG', 'SHORT').required(),
  entry_price: Joi.number().positive().required(),
  // ...
});
```

Consumidos por el middleware `validate(schema, target)`:

```js
router.post('/', validate(createTradeSchema, 'body'), controller.createTrade);
```

## Error handling

`src/middleware/errorHandler.js`:

```
AppError (base: message, statusCode, code, isOperational=true)
├── NotFoundError       (404, NOT_FOUND)
├── ValidationError     (400, VALIDATION_ERROR, details[])
├── ConflictError       (409, CONFLICT)
└── DatabaseError       (500, DATABASE_ERROR)
```

El middleware central distingue:

- `err.isOperational` → respuesta controlada con `statusCode`/`code`.
- `err.isJoi` → mapea a `VALIDATION_ERROR` con `details` formateados.
- Códigos PG: `23505` → 409 `DUPLICATE_ENTRY`, `23503` → 400 `INVALID_REFERENCE`, `23514` → 400 `CHECK_VIOLATION`.
- Códigos Multer: `LIMIT_FILE_SIZE` → 400 `FILE_TOO_LARGE`, `LIMIT_UNEXPECTED_FILE` → 400 `INVALID_FILE_TYPE`.
- Cualquier otro → 500 con mensaje genérico en producción (en dev expone `err.message`).

## Pool de Postgres

`src/config/database.js`:

```js
new Pool({
  host, port, database, user, password,
  max: 20,                          // 20 conexiones max
  idleTimeoutMillis: 30000,         // cierra idle tras 30s
  connectionTimeoutMillis: 2000,    // 2s para conectar
});
```

Se exporta `query(text, params)` (auto-log de duración) y `getClient()` para transacciones. La función `testConnection()` se llama al arrancar; si falla, el proceso se mata.

## Logging

`src/utils/logger.js` exporta una instancia de Winston con:

- Transport **consola** (con colores en dev).
- Transport **archivo JSON** en `LOG_DIR` (default `./logs/`), nivel `error` (errores) y combined.
- Nivel global configurable via `LOG_LEVEL` env.

**Gap conocido**: no hay rotación. Ver [`../analysis/scaling.md`](../analysis/scaling.md#fase-0--hardening-pre-publicación).

## Upload de imágenes

`src/middleware/upload.js`:

- `multer.diskStorage` apuntando a `config.upload.dir` (default `./uploads`).
- Nombres únicos generados por `generateUniqueFilename()` (UUID + timestamp + extensión original).
- Filtro: solo `image/jpeg|png|webp|gif` (MIME + extensión).
- Límites: `fileSize: config.upload.maxFileSize` (default 5MB del env, pero el `errorHandler` muestra "1MB" — inconsistencia documentada en [`../analysis/security.md`](../analysis/security.md)).
- `files: 10` máximo por request.

Exporta:
- `uploadTradeImages` (`multer.array('images', 10)`) — usado en trade routes.
- `uploadTradeImage` (`multer.single('image')`) — usado en backtest routes.
- `upload.single('image')` — usado para imágenes de note_blocks.

## Auth (resumen)

JWT firmado con `JWT_SECRET`, payload `{ userId, email, role }`, expira en `JWT_EXPIRES_IN` (default `7d`).

- `authenticate` middleware exige `Authorization: Bearer <token>`, popula `req.user`.
- `optionalAuth` no falla si no hay token (para endpoints híbridos — no usado actualmente).
- `authorize('admin', 'super_admin')` chequea `req.user.role`.

Flujo de Google OAuth y bootstrap del super_admin en [`auth.md`](auth.md).

## Cómo extender

Para añadir un endpoint nuevo, ver el checklist en [`../development/workflow.md#cómo-añadir-un-endpoint-nuevo`](../development/workflow.md#cómo-añadir-un-endpoint-nuevo).
