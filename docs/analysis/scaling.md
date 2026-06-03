# Análisis de escalabilidad — Trading Journal

> **Audiencia**: el dueño del proyecto, evaluando publicar la app con presupuesto limitado (≤1-2 VPS modestas, sin servicios cloud caros). Este documento prioriza cambios de **alto impacto / bajo costo** y delibera trade-offs explícitos.

> **Cómo leer este documento**: las **fases** son secuenciales (cada una asume la anterior). Cada fase incluye costo aproximado en *días-persona*, no en dinero — el costo monetario directo apunta a ≤ USD 10/mes total para el infrastructure recomendado.

---

## Resumen ejecutivo (TL;DR)

Antes de publicar la app, los cuellos de botella reales son **5** — ninguno requiere reescribir grandes partes:

1. **Sin rate limiting**: cualquiera puede abusar de `POST /api/auth/google` o `POST /api/trades/import`. Riesgo inmediato.
2. **Sin caching de stats**: 6 endpoints de stats recalculan agregados SQL en cada request. Solo con 5 usuarios activos = 30+ queries/min innecesarias.
3. **Logs sin rotación**: van a llenar el disco de la VPS en semanas/meses según uso.
4. **JWT sin revocación**: logout no expulsa otras sesiones; si un token se filtra, vale 7 días.
5. **Imágenes servidas directamente del disco local**: sin CDN ni cache, cada vista de una galería pega al backend.

Los 5 se resuelven en **Fase 0 + Fase 1** del plan abajo, en ~1-2 semanas de trabajo concentrado. El resto del documento es para cuando crezca la base de usuarios.

---

## Diagnóstico actual

### Cuellos de botella inmediatos

| # | Problema | Evidencia | Impacto |
|---|----------|-----------|---------|
| 1 | Sin caching server-side | No hay Redis ni LRU en memoria. `stats.service.js` ejecuta SQL aggregations por request. | CPU + I/O proporcional a usuarios activos × refreshes. |
| 2 | Stats fragmentado en 6 endpoints | `Stats.jsx` hace 6 fetches en paralelo. | 6× round-trips por entrada a la página de stats. |
| 3 | Paginación offset-based | `trade.repository.js` usa `LIMIT/OFFSET`. | Página 100 escanea 100×20=2000 filas. Lento sobre 10k+. |
| 4 | Imágenes en disco local | `multer.diskStorage` → `uploads/`. Servidas por `express.static`. | Cada petición pasa por Node (no nginx puro). Sin Cache-Control. |
| 5 | Sin rate limiting | Faltante. Endpoints como `/api/auth/google` y `/api/trades/import` no tienen freno. | DoS, brute-force, abuso de cómputo CSV. |
| 6 | Sin rotación de logs | Winston escribe a archivos planos sin tope. | Disco se llena. Recovery requiere `truncate` manual. |
| 7 | JWT sin revocación | `auth.service.verifyToken` solo chequea firma + expiración. | Logout no expulsa. Tokens robados valen 7d. |
| 8 | Bootstrap super_admin frágil | `initSuperAdmin()` depende de `SUPER_ADMIN_EMAIL` env. | Si la env se pierde, no hay recuperación sin tocar la BD. |
| 9 | Pool de DB con `max: 20` | `database.js`. | Por instancia. Con 1 instancia es suficiente; con >1 hay que dimensionar. |
| 10 | Sin code splitting frontend | Bundle único, sin `React.lazy`. | First load más lento; mejorable trivialmente. |

### Riesgos específicos de publicación

- **Sin rate limiting** y **sin captcha**: brute-force trivial sobre `/api/auth/google` (mitigable porque Google ya rate-limit), pero **CSV import sin throttle** permite que un usuario malintencionado dispare cómputo pesado en loop.
- **No hay observabilidad continua**: si un endpoint empieza a fallar a las 3am, te enterás al día siguiente.
- **Sin separación de tenants** en el sentido fuerte: todos los usuarios comparten la misma tabla `trades`, separación solo por `user_id`. Un bug en una query (olvidar el `WHERE user_id = $1`) leak data.
- **Imágenes sin auth**: `/api/images/:filename` es público — filename es UUID no adivinable pero **no es secreto** (puede compartirse). No es un secret store.

---

## Plan por fases

### Fase 0 — Hardening pre-publicación

**Objetivo**: cerrar los gaps que rompen confianza básica del usuario / atacante mínimo. **No** se puede publicar sin esto.

**Esfuerzo**: 3-5 días.

**Acciones**:

1. **Rate limiting** con `express-rate-limit` (in-memory, sin Redis):
   - Global: 300 req/min por IP.
   - `POST /api/auth/google`: 10 req/min por IP.
   - `POST /api/trades/import` y `POST /api/trades/import/preview`: 5 req/min por usuario.
   - `POST /api/trades`, `POST /api/notes/*`: 60 req/min por usuario.

   ```js
   import rateLimit from 'express-rate-limit';

   const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });
   app.use('/api/auth/google', authLimiter);
   ```

2. **Rotación de logs** con `winston-daily-rotate-file`:
   - Rotar diariamente, comprimir, mantener 14 días.
   - Alternativa zero-code: configurar `logrotate` en el host con `copytruncate` (ver `docs/operations/monitoring.md`).

3. **Headers de seguridad estrictos**:
   - Revisar la CSP de Helmet (hoy permisiva). Ajustar al mínimo necesario.
   - Forzar `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
   - `Permissions-Policy` para deshabilitar capacidades no usadas (camera, microphone, geolocation).

4. **Consistencia en mensajes de error**: el `errorHandler` hardcoded "1MB" mientras `MAX_FILE_SIZE` es 5MB. Corregir el mensaje (usar `config.upload.maxFileSize`).

5. **Validación de imágenes server-side**:
   - Hoy solo MIME y extensión, no contenido real.
   - Añadir `file-type` (npm) para verificar magic bytes.
   - Opcional: `sharp` para chequear que es decodificable y limitar dimensiones máximas (e.g. ≤4000×4000) para prevenir image-bomb.

6. **Health check enriquecido**: `/api/health` debería intentar `SELECT 1` contra la BD y devolver `db: ok|down`.

7. **Documentación de secretos**: cómo rotar `JWT_SECRET` (todos pierden sesión), cómo cambiar `GOOGLE_CLIENT_ID`, dónde se guardan backups. Hecho parcial en `docs/operations/env-vars.md`.

8. **CSP de Helmet** explícita: hoy `crossOriginResourcePolicy: cross-origin` es necesario para servir `/api/images/*` al frontend, pero conviene revisar `contentSecurityPolicy`.

**Costo monetario**: USD 0.

---

### Fase 1 — Caching ligero in-process

**Objetivo**: eliminar el 80% del cómputo redundante de stats sin agregar Redis.

**Esfuerzo**: 2-4 días.

**Acciones**:

1. **LRU cache in-process** con `lru-cache` (npm):

   ```js
   import { LRUCache } from 'lru-cache';
   const statsCache = new LRUCache({ max: 500, ttl: 60_000 }); // 60s TTL

   export const getGeneralStats = async (userId, filters) => {
     const key = `general:${userId}:${JSON.stringify(filters)}`;
     const cached = statsCache.get(key);
     if (cached) return cached;

     const result = await statsRepository.getGeneral(userId, filters);
     statsCache.set(key, result);
     return result;
   };
   ```

2. **Invalidación en mutaciones**: cuando un `tradeService.create/update/delete` corre, invalidar las entradas de stats del usuario:

   ```js
   statsCache.forEach((_, key) => {
     if (key.includes(`:${userId}:`)) statsCache.delete(key);
   });
   ```

3. **ETags / `Cache-Control` para `/api/images/:filename`**:
   - Imágenes son inmutables (UUID + timestamp). Setear `Cache-Control: public, max-age=31536000, immutable`.
   - El navegador no las re-pide hasta que cambie la URL.

4. **Compresión de respuestas**: agregar `compression` middleware para JSON >1KB (gzip).

**Trade-off**: LRU in-process no comparte estado entre múltiples instancias del backend. Con 1 instancia (recomendado low-budget), no hay problema. Si más adelante necesitamos escalar horizontalmente, migrar a Redis o aceptar inconsistencia eventual de cache.

**Costo monetario**: USD 0.

---

### Fase 2 — Optimización de DB

**Objetivo**: queries rápidas incluso con 100k+ trades por usuario.

**Esfuerzo**: 3-5 días.

**Acciones**:

1. **Índices compuestos por `user_id`**:

   ```sql
   CREATE INDEX IF NOT EXISTS idx_trades_user_entry_date_desc
     ON trades (user_id, entry_date DESC) WHERE deleted_at IS NULL;
   CREATE INDEX IF NOT EXISTS idx_trades_user_symbol
     ON trades (user_id, symbol) WHERE deleted_at IS NULL;
   CREATE INDEX IF NOT EXISTS idx_trades_user_status
     ON trades (user_id, status) WHERE deleted_at IS NULL;
   CREATE INDEX IF NOT EXISTS idx_notes_user_parent
     ON notes (user_id, parent_id);
   ```

   `WHERE deleted_at IS NULL` los hace **partial indexes** — más chicos y rápidos para el caso común.

2. **Paginación cursor-based** para listados grandes:

   En lugar de `LIMIT 20 OFFSET 1980`, usar `WHERE entry_date < $cursor ORDER BY entry_date DESC LIMIT 20`. La UI guarda el `entry_date` del último visto.

   Refactor: `trade.repository.findAll` acepta `{ cursor, limit }` además del actual `{ page, limit }`. Endpoint nuevo o backwards-compat con query param.

3. **EXPLAIN ANALYZE** de las queries de stats:

   ```sql
   EXPLAIN (ANALYZE, BUFFERS)
   SELECT COUNT(*), AVG(pnl), ...
   FROM trades WHERE user_id = 1 AND deleted_at IS NULL;
   ```

   Identificar full table scans y ajustar.

4. **Vista materializada para stats globales del usuario** (si caching de Fase 1 no alcanza):

   ```sql
   CREATE MATERIALIZED VIEW user_stats_summary AS
   SELECT user_id,
          COUNT(*) AS total_trades,
          SUM(pnl) AS total_pnl,
          ...
   FROM trades WHERE deleted_at IS NULL
   GROUP BY user_id;
   CREATE UNIQUE INDEX ON user_stats_summary (user_id);
   ```

   Refresh manual tras mutaciones (`REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats_summary`).

   > **No** recomendado todavía — el caching LRU + indexes alcanza hasta ~100 usuarios activos. Reservar para cuando se mida real.

5. **`pg_stat_statements`** habilitado para diagnosticar queries lentas (ver `docs/operations/monitoring.md`).

6. **VACUUM ANALYZE** periódico (cron weekly) en tablas con muchas mutaciones (trades, note_blocks).

**Costo monetario**: USD 0.

---

### Fase 3 — Almacenamiento de imágenes

**Objetivo**: descargar al backend de servir bytes, y proteger ante crecimiento del disco.

**Esfuerzo**: 3-7 días.

**Opciones (elegir UNA — decisión pendiente, ver `pending-decisions.md` D-005)**:

#### Opción A — Quedarse en disco local + Cloudflare gratis

- Cloudflare como CDN (free plan).
- Cachea respuestas con `Cache-Control: immutable, max-age=31536000`.
- DDoS protection incluido.
- Backups del directorio `uploads/` con `rsync` a Backblaze B2 (5 GB free).

**Pros**: USD 0/mes, simplicidad, no cambia el código.
**Contras**: disco local sigue siendo cuello de botella si se vuelven masivas; no hay redundancia hasta el backup.

#### Opción B — Object storage S3-compatible (Backblaze B2 o Cloudflare R2)

- B2: 10 GB free + USD 0.005/GB/mes after.
- R2: 10 GB free + USD 0.015/GB/mes after, **sin egress fees** (ventaja vs S3).
- Cliente: `@aws-sdk/client-s3` (con endpoint custom).
- Cambio de código: `multer-s3` reemplaza `multer.diskStorage`. URL del archivo apunta directo al bucket.

**Pros**: independiente del disco del backend, escala infinito.
**Contras**: latencia un poco mayor en upload, complejidad nueva, costo > 0 si volumen crece.

**Recomendación tentativa**: empezar con **Opción A** (disco local + Cloudflare), migrar a **Opción B** solo si el bucket de uploads supera 1 GB.

#### En cualquier caso

- **Generar thumbnails** con `sharp` al subir:
  ```js
  await sharp(originalPath).resize(200, 200, { fit: 'inside' }).webp({ quality: 80 }).toFile(thumbPath);
  ```
  Listar imágenes en tablas usa el thumbnail (~10× más liviano). Detalle del original solo cuando se abre modal.

- **Eliminar archivos huérfanos**: cron que compare `uploads/` contra `trade_images.filename` y borre los que ya no estén referenciados.

**Costo monetario**: USD 0-5/mes.

---

### Fase 4 — Compute y workers

**Objetivo**: aislar tareas pesadas (CSV import, generación de thumbnails) del request principal.

**Esfuerzo**: 1-2 semanas.

**Acciones**:

1. **CSV import asíncrono**:
   - Hoy el endpoint procesa síncrono. Con 10000 filas tarda y bloquea.
   - Migrar a queue con **`pg-boss`** (queue en Postgres, sin Redis). El endpoint pone un job, devuelve `{ jobId }`. La UI hace polling a `/api/imports/:jobId/status`.
   - Workers son procesos Node separados leyendo de `pg-boss`. Pueden correr en el mismo container o uno dedicado.

2. **Thumbnail generation asíncrono**: cuando se sube una imagen, encolar un job. Hasta que termine, la galería muestra el original (o un placeholder).

3. **Mover compresión 100% al cliente** (ya está, pero reforzar): documentar que el cliente DEBE comprimir antes de subir; el backend rechaza imágenes >2MB.

4. **Cleanup de soft-deletes**: cron mensual que purga `trades.deleted_at > 90 días`.

**Costo monetario**: USD 0.

---

### Fase 5 — Escalado horizontal mínimo

**Objetivo**: poder correr múltiples instancias del backend cuando 1 no alcance.

**Esfuerzo**: 2-3 semanas.

**Pre-requisitos críticos**:
- **Cache compartido**: LRU in-process deja de funcionar — migrar a Redis (DigitalOcean Managed Redis USD 15/mes, o self-host en la VPS gratis).
- **Sesiones stateless**: JWT ya lo cubre.
- **Filesystem compartido para uploads**: si el backend está distribuido, los uploads deben ir a object storage (Fase 3 Opción B) o a un disco compartido (NFS, no recomendado a esta escala).
- **JWT revocation list en Postgres**: tabla `jwt_revocations (jti, expires_at)` consultada en `authenticate` con caching local (LRU 1 min). Borrar entradas expiradas en cron.

**Acciones**:

1. Configurar nginx upstream con múltiples backends:
   ```nginx
   upstream tradelog_backend {
     least_conn;
     server 127.0.0.1:3002;
     server 127.0.0.1:3003;
   }
   ```
2. Levantar más instancias del container.
3. Postgres: subir `max_connections` o agregar **PgBouncer** (statement-level pooling).
4. Si la base se vuelve cuello: réplica de lectura para stats agregadas (master para writes, replica para reads). Requiere `pg_basebackup` + `replication slot`.

**Costo monetario**: USD 10-20/mes (instancia extra + Redis si managed).

---

## Recomendaciones de infraestructura "low budget"

Para una app de uso personal expandida a un grupo pequeño-medio (≤100 usuarios activos):

| Componente | Recomendación | Costo |
|------------|---------------|-------|
| VPS | DigitalOcean / Hetzner / Vultr, 2 vCPU / 4 GB RAM | USD 4-12/mes |
| Postgres | Mismo VPS (el actual ya está así, compartido con market-tracker) | incluido |
| CDN + WAF | Cloudflare Free | USD 0 |
| TLS | Let's Encrypt (certbot) — ya configurado | USD 0 |
| Backups | Backblaze B2 (5 GB free → USD 0.005/GB extra), cron diario via `b2 cli` | USD 0-1/mes |
| Monitoring | UptimeRobot Free (50 monitors) | USD 0 |
| Logs | Rotados en disco + opcionalmente enviados a un sink simple (e.g. Better Stack Free hasta 1 GB) | USD 0 |
| Imágenes | Disco local + Cloudflare cache (Opción A) | USD 0 |
| DNS | Cloudflare o el del registrar | USD 0 (domain renewal aparte) |

**Total mensual estimado**: USD 5-15.

---

## Métricas clave a vigilar (al publicar)

- Requests/min al backend, especialmente picos.
- Tasa de error 5xx — alerta en >0.1% sostenido.
- Latencia p95 de `/api/trades` y `/api/stats/*` — alerta en >500ms sostenido.
- Conexiones activas a Postgres — alerta en >18/20 sostenido.
- Espacio en disco `/home/deploy/tradelog-data/` — alerta al 80%.
- Tamaño de `logs/` — alerta al 1 GB.

---

## Lo que **no** recomiendo hacer

- **Migrar a Next.js / SSR** ahora. La app es perfectamente válida como SPA pura. SSR añade complejidad sin beneficio claro para esta UX.
- **Microservicios**. El monolito Express es óptimo para esta escala.
- **Kubernetes**. Costo operativo enorme vs beneficio inexistente con 1-2 VPS.
- **Mover ya a managed Postgres**. Si el costo no es problema, hacelo (más backups, más mantenimiento), pero hoy el postgres compartido en VPS funciona.
- **Reescribir el frontend en TypeScript** "por escalar". Si se hace, sea por mejor DX, no por escalado.

---

## Decisiones que dependen de respuestas del dueño

Estas decisiones se respondieron parcialmente arriba con "recomendaciones tentativas". Las preguntas formales y sus opciones están en [`../pending-decisions.md`](../pending-decisions.md):

- **D-001**: Multi-tenant duro o blando.
- **D-002**: Registro abierto vs whitelist.
- **D-005**: Storage de imágenes (Opción A local+CDN vs Opción B object storage).
- **D-006**: JWT revocation Postgres vs aceptar limitación actual.
- **D-007**: Modelo de monetización (afecta rate limits y cuotas por usuario).
- **D-008**: Postgres compartido con market-tracker o aislado.
- **D-009**: SLA pretendido (cuánta observabilidad invertir).

Ninguna bloquea Fase 0 + Fase 1. Las respuestas son necesarias antes de Fase 3-5.

---

## Resumen visual

```
Cuello de botella                Fase    Costo en días    Costo mensual
─────────────────────────────────────────────────────────────────────────
Rate limit, logs, secrets        0       3-5              USD 0
Caching stats / Cache-Control    1       2-4              USD 0
Índices, cursor pagination       2       3-5              USD 0
Imágenes (CDN o object store)    3       3-7              USD 0-5
Workers (CSV, thumbs, cleanup)   4       1-2 sem          USD 0
Escalar horizontal (Redis, etc)  5       2-3 sem          USD 10-20
```

Fase 0 + Fase 1 son **mandatorios pre-publicación**. Fases 2-4 cuando crezca. Fase 5 solo si 1 VPS no alcanza.
