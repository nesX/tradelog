#!/bin/bash
# Ejecutar desde tu PC local para descargar los backups de la VPS
# Uso: ./sync-backups.sh <IP_VPS>

VPS_USER=deploy
VPS_HOST=${1:-"contabo_vps"}
REMOTE_DIR=/home/deploy/backups/tradelog/
LOCAL_DIR=~/backups/tradelog/

mkdir -p "$LOCAL_DIR"

echo "Sincronizando backups desde $VPS_USER@$VPS_HOST..."
rsync -avz --progress "$VPS_USER@$VPS_HOST:$REMOTE_DIR" "$LOCAL_DIR"
echo "Listo. Backups en: $LOCAL_DIR"
