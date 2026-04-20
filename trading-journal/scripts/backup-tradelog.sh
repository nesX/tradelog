#!/bin/bash
set -e

DATE=$(date +%Y%m%d)
BACKUP_DIR=/home/deploy/backups/tradelog
POSTGRES_CONTAINER=market-tracker-postgres-1
UPLOADS_DIR=/home/deploy/tradelog-data/uploads

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Iniciando backup tradelog..."

# Base de datos
docker exec "$POSTGRES_CONTAINER" pg_dump -U postgres -d tradelog -F c -f /tmp/tradelog_"$DATE".dump
docker cp "$POSTGRES_CONTAINER":/tmp/tradelog_"$DATE".dump "$BACKUP_DIR"/tradelog_"$DATE".dump
echo "[$(date)] BD exportada: $BACKUP_DIR/tradelog_$DATE.dump"

# Imágenes/uploads
tar -czf "$BACKUP_DIR"/uploads_"$DATE".tar.gz -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
echo "[$(date)] Uploads comprimidos: $BACKUP_DIR/uploads_$DATE.tar.gz"

# Limpiar backups de más de 7 días
find "$BACKUP_DIR" -mtime +7 -delete
echo "[$(date)] Backups antiguos eliminados."

echo "[$(date)] Backup completado."
