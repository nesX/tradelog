# Database — operaciones

Postgres 16 en contenedor (dev) o postgres compartido del proyecto `market-tracker` (prod).

## Conectarse a la BD

### Dev (Docker)

```bash
sudo docker exec -it tradelog-db psql -U postgres -d trading_journal
```

### Prod (postgres compartido)

```bash
# Desde la VPS
docker exec -it market-tracker-postgres-1 psql -U tradelog_user -d tradelog
```

## Aplicar una migración

Las migraciones son archivos SQL planos en `trading-journal/database/0NN_*.sql`. **No hay framework de migraciones automatizado.**

### Crear una nueva migración

```bash
# Continuar la numeración (mirar el último: 023)
touch trading-journal/database/024_descripcion_corta.sql
```

Convenciones:
- Numeración secuencial de 3 dígitos.
- Idempotente: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- Comentarios al principio explicando qué cambia y por qué.
- Si la migración no es reversible, dejarlo escrito en un comentario.

### Aplicar en dev

```bash
sudo docker exec -i tradelog-db psql -U postgres -d trading_journal \
  < trading-journal/database/024_descripcion_corta.sql
```

### Aplicar en prod

```bash
# Backup primero (siempre)
docker exec market-tracker-postgres-1 pg_dump -U tradelog_user -F c -d tradelog \
  > /tmp/tradelog_pre_migration_$(date +%Y%m%d_%H%M).dump

# Aplicar
docker exec -i market-tracker-postgres-1 psql -U tradelog_user -d tradelog \
  < trading-journal/database/024_descripcion_corta.sql

# Verificar
docker exec -it market-tracker-postgres-1 psql -U tradelog_user -d tradelog -c "\d trades"
```

## Backups

### Manual

```bash
# Formato custom (recomendado, comprimido)
docker exec tradelog-db pg_dump -U postgres -F c -d trading_journal \
  > backup_$(date +%Y%m%d).dump

# Formato plain SQL (legible)
docker exec tradelog-db pg_dump -U postgres -d trading_journal \
  > backup_$(date +%Y%m%d).sql
```

En prod:

```bash
docker exec market-tracker-postgres-1 pg_dump -U tradelog_user -F c -d tradelog \
  > ~/backups/tradelog_$(date +%Y%m%d_%H%M).dump
```

### Restore

```bash
# Formato custom
docker cp backup.dump tradelog-db:/tmp/
docker exec tradelog-db pg_restore -U postgres -d trading_journal -F c /tmp/backup.dump

# Formato SQL plano
docker exec -i tradelog-db psql -U postgres -d trading_journal < backup.sql
```

### Automatización (cron en la VPS)

Ejemplo de cron diario con retención de 14 días, subiendo a Backblaze B2 (gratuito 5 GB):

```cron
# /etc/cron.d/tradelog-backup
0 3 * * * deploy /home/deploy/scripts/backup-tradelog.sh
```

Script `backup-tradelog.sh` (esqueleto — no creado aún):

```bash
#!/bin/bash
set -e
BACKUP_DIR=/home/deploy/backups/tradelog
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M)
FILE="$BACKUP_DIR/tradelog_$DATE.dump"

docker exec market-tracker-postgres-1 pg_dump -U tradelog_user -F c -d tradelog > "$FILE"

# Subir a B2 (requiere b2 CLI configurado)
b2 upload-file my-backup-bucket "$FILE" "tradelog/$DATE.dump"

# Limpiar locales >14 días
find "$BACKUP_DIR" -name 'tradelog_*.dump' -mtime +14 -delete
```

Decisión pendiente: ¿implementar este script ahora o luego de lanzamiento? Ver [`../pending-decisions.md`](../pending-decisions.md) D-014.

## Inspección rápida

```sql
-- Tamaño de la BD
SELECT pg_size_pretty(pg_database_size('trading_journal'));

-- Tamaño por tabla
SELECT relname AS table,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       pg_size_pretty(pg_relation_size(relid)) AS table_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- Trades por usuario
SELECT user_id, COUNT(*), COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active
FROM trades
GROUP BY user_id ORDER BY count DESC;

-- Conexiones activas
SELECT pid, usename, client_addr, state, query
FROM pg_stat_activity
WHERE datname = 'trading_journal';

-- Queries más lentas (requiere pg_stat_statements habilitado)
SELECT total_exec_time, calls, mean_exec_time, query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

## VACUUM / ANALYZE

Postgres ejecuta autovacuum por defecto. Forzar manualmente si el tamaño crece raro tras muchos deletes:

```sql
VACUUM ANALYZE trades;
VACUUM ANALYZE note_blocks;
```

Tras una operación masiva (e.g. eliminar muchos trades soft-deleted con un script de cleanup):

```sql
VACUUM FULL trades;   -- bloquea la tabla — solo en ventanas de mantenimiento
```

## Limpieza de soft-deletes

`trades` tiene soft-delete (`deleted_at IS NOT NULL`). Para purgar definitivamente filas viejas:

```sql
DELETE FROM trades
WHERE deleted_at IS NOT NULL
  AND deleted_at < NOW() - INTERVAL '90 days';
```

Esto **también borra** sus `trade_images` (CASCADE), pero **no borra los archivos físicos en `uploads/`**. Para limpiar huérfanos:

```bash
# Listar archivos en uploads que no aparecen en la BD
docker exec tradelog-backend node -e "
  /* script ad-hoc; reemplazar por uno real cuando se necesite */
"
```

Esto es un TODO conocido — los archivos huérfanos se acumulan. Ver [`../roadmap.md`](../roadmap.md).

## Reset completo (dev)

```bash
sudo docker compose down -v   # ⚠ borra el volumen
sudo docker compose --env-file backend/.env up -d --build

# Re-cargar schema y migraciones
cd trading-journal
for f in database/0*.sql; do
  sudo docker exec -i tradelog-db psql -U postgres -d trading_journal < "$f"
done
```
