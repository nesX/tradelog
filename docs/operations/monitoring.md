# Monitoring

Trading Journal corre como tres servicios sin observabilidad pesada (no Prometheus, no Grafana). Esta guía cubre qué hay hoy y qué vigilar manualmente.

## Healthcheck

`GET /api/health` (público, sin auth):

```json
{
  "success": true,
  "data": { "status": "ok", "timestamp": "...", "environment": "production" }
}
```

Es **superficial** — solo confirma que el proceso responde. No prueba conexión a la BD. Sugerencia: enriquecer con `await query('SELECT 1')` y devolver `db: "ok"`/`"down"`. Pendiente.

### UptimeRobot / Healthchecks.io

Recomendación gratuita: registrar `https://tradelog.nesx.co/api/health` en UptimeRobot (50 monitors free, ping cada 5 min). Notifica por email o webhook si falla.

## Logs

### Backend — Winston

Configurado en `src/utils/logger.js`:

- **Consola** (siempre): texto coloreado en dev, JSON en prod.
- **Archivos**:
  - `LOG_DIR/error.log` — nivel `error`.
  - `LOG_DIR/combined.log` — todos.

Path:
- Dev: `./trading-journal/backend/logs/`.
- Prod: `$HOST_LOGS_DIR` (default `/home/deploy/tradelog-data/logs/`).

**Formato JSON estructurado**:

```json
{
  "level": "error",
  "message": "Error capturado",
  "code": "VALIDATION_ERROR",
  "url": "/api/trades",
  "method": "POST",
  "validationDetails": [...],
  "requestBody": {...},
  "timestamp": "2026-05-28T12:34:56.789Z"
}
```

### Ver logs en tiempo real

```bash
# Backend con Docker
sudo docker logs tradelog-backend -f

# Filtrar errores
sudo docker logs tradelog-backend 2>&1 | grep '"level":"error"'

# En prod, leer el archivo
tail -f /home/deploy/tradelog-data/logs/combined.log | jq .
```

### ⚠ Sin rotación

Hoy los archivos crecen sin límite. En la VPS esto **llenará el disco** eventualmente. Workarounds:

- Manual: `truncate -s 0 logs/*.log` cuando crezcan.
- Logrotate del sistema (preferido):
  ```
  # /etc/logrotate.d/tradelog
  /home/deploy/tradelog-data/logs/*.log {
      daily
      rotate 14
      compress
      missingok
      notifempty
      copytruncate
  }
  ```
- **Fix definitivo**: cambiar Winston a `winston-daily-rotate-file`. Tracked en [`../analysis/scaling.md`](../analysis/scaling.md#fase-0--hardening-pre-publicación).

### Frontend

No tiene logging server-side. Errores del navegador van a la consola del usuario. Sugerencia futura: Sentry (free tier 5k events/mes) o `console.error` capturado a un endpoint propio.

## Qué vigilar manualmente

### Tamaño de uploads

```bash
du -sh /home/deploy/tradelog-data/uploads/
ls /home/deploy/tradelog-data/uploads/ | wc -l
```

Si crece más rápido de lo esperado, hay un trade con imágenes muy pesadas (la compresión client-side debería evitarlo, pero no es 100% confiable).

### Tamaño de logs

```bash
du -sh /home/deploy/tradelog-data/logs/
```

Por encima de 1 GB → tiempo de rotar manualmente o configurar logrotate.

### Conexiones a Postgres

```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'tradelog';
```

El pool del backend limita a 20 (por instancia). Si ves 20 sostenidamente, hay queries lentas reteniendo conexiones. Identificar con:

```sql
SELECT pid, query, state, wait_event, NOW() - query_start AS duration
FROM pg_stat_activity
WHERE datname = 'tradelog' AND state != 'idle'
ORDER BY duration DESC;
```

### Queries lentas

Habilitar `pg_stat_statements` en el postgres compartido (en `market-tracker-postgres-1`):

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- editar postgresql.conf:
-- shared_preload_libraries = 'pg_stat_statements'
-- restart postgres
```

Luego:

```sql
SELECT total_exec_time, mean_exec_time, calls, query
FROM pg_stat_statements
WHERE query LIKE '%trades%' OR query LIKE '%notes%'
ORDER BY total_exec_time DESC LIMIT 20;
```

### CPU / memoria del backend

```bash
sudo docker stats tradelog-backend
```

Si la RAM crece sostenidamente y no decrece → posible leak. Reiniciar y reportar para investigar.

### Espacio en disco

```bash
df -h
```

Particularmente en `/home/deploy/tradelog-data/` (volúmenes de la app) y `/var/lib/docker/` (imágenes y volúmenes).

## Alertas

Hoy las alertas de deploy van a `market-tracker:3001/api/send-alert` (que reenvía a Telegram, según el patrón del proyecto). No hay alertas de salud continua.

Sugerencia mínima sin gasto:

1. UptimeRobot → email/Telegram en caída de `tradelog.nesx.co` o `/api/health`.
2. Cron en la VPS que `df -h` y mande a Telegram si `/` >85%.
3. Cron similar para `du -sh uploads/` y `logs/`.

## Si algo falla

1. `sudo docker compose -f docker-compose.prod.yml ps` — ¿están corriendo?
2. `sudo docker logs tradelog-backend --tail 200`.
3. Revisar `/home/deploy/tradelog-data/logs/error.log`.
4. ¿Postgres conectable? `docker exec market-tracker-postgres-1 psql -U tradelog_user -d tradelog -c '\dt'`.
5. ¿Nginx OK? `sudo nginx -t`, `sudo systemctl status nginx`.
6. ¿Cert SSL vigente? `sudo certbot certificates`.

Más detalle en [`troubleshooting.md`](troubleshooting.md).
