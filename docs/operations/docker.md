# Docker — Referencia rápida

Tres composiciones distintas en este repo:

| Archivo | Cuándo | Servicios |
|---------|--------|-----------|
| `trading-journal/docker-compose.yml` | Desarrollo local | `db` (postgres 16) + `backend` (Node, watch) + `frontend` (Vite dev server) |
| `trading-journal/docker-compose.prod.yml` | Producción en la VPS | `backend` + `frontend` (build estático con nginx). **Sin `db`** — usa el postgres de `market-tracker`. |
| (heredado) `backend/Dockerfile` y `frontend/Dockerfile.prod` | Imágenes base | |

## Comandos por tarea

### Levantar todo (dev)

```bash
cd trading-journal
sudo docker compose --env-file backend/.env up -d --build
```

`--env-file backend/.env` es importante porque las variables como `${UPLOAD_DIR}` y `${LOG_DIR}` se resuelven en build-time de compose, antes de aplicar `env_file:`.

### Rebuild selectivo

```bash
# Solo backend tras cambios en deps o Dockerfile
sudo docker compose --env-file backend/.env up -d --build backend

# Solo frontend
sudo docker compose --env-file backend/.env up -d --build frontend
```

### Logs

```bash
# Backend en vivo
sudo docker logs tradelog-backend -f

# Últimas 100 líneas del frontend
sudo docker logs --tail 100 tradelog-frontend

# Todo con docker compose
sudo docker compose logs -f
sudo docker compose logs -f backend
```

### Entrar al contenedor

```bash
# Backend
sudo docker exec -it tradelog-backend sh

# Postgres (psql)
sudo docker exec -it tradelog-db psql -U postgres -d trading_journal
```

### Aplicar una migración

```bash
sudo docker exec -i tradelog-db psql -U postgres -d trading_journal \
  < trading-journal/database/0NN_mi_migracion.sql
```

### Parar / reiniciar

```bash
# Parar
sudo docker compose down

# Parar y borrar volúmenes (⚠ ELIMINA LA BD)
sudo docker compose down -v

# Reiniciar solo un servicio
sudo docker compose restart backend
```

### Limpiar imágenes huérfanas

```bash
sudo docker image prune -f
```

## Producción

```bash
# Primera vez
cd ~/tradelog/trading-journal
cp .env.prod.example .env       # nombre exacto requerido
$EDITOR .env                    # completar todos los valores
sudo docker compose -f docker-compose.prod.yml up -d --build

# Verificar
sudo docker compose -f docker-compose.prod.yml ps

# Actualizaciones (las hace el workflow de CI/CD)
git pull
sudo docker compose -f docker-compose.prod.yml up -d --build backend  # o frontend
```

Más detalle de deploy: [`deployment.md`](deployment.md).

## Volúmenes y datos persistentes

| Volumen | Contenido | Dónde queda |
|---------|-----------|-------------|
| `tradelog_db_data` | Datos de Postgres (dev) | Volumen Docker named — sobrevive a `down`, no a `down -v`. |
| `./backend/uploads` | Imágenes subidas (dev) | Mount al host. |
| `./backend/logs` | Logs JSON de Winston (dev) | Mount al host. |
| `${HOST_UPLOADS_DIR}` | Imágenes (prod) | Path en la VPS (default `/home/deploy/tradelog-data/uploads`). |
| `${HOST_LOGS_DIR}` | Logs (prod) | Path en la VPS (default `/home/deploy/tradelog-data/logs`). |

Backups de la BD: ver [`database-ops.md`](database-ops.md).

## Puertos

### Dev (local)

| Puerto host | Servicio |
|-------------|----------|
| 5173 | Frontend (Vite) |
| 3000 | Backend (Express) |
| 5433 | Postgres (mapeado desde 5432 interno) |

### Prod (en la VPS, todos bind a `127.0.0.1`)

| Puerto | Servicio | Notas |
|--------|----------|-------|
| 3002 | Backend | nginx hace proxy desde `tradelog.nesx.co/api/*` |
| 5174 | Frontend (nginx interno del contenedor) | nginx hace proxy desde `tradelog.nesx.co/` |

## Troubleshooting Docker

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `Cannot connect to the Docker daemon` | El daemon no corre, o falta `sudo`. | `sudo systemctl start docker` y usar `sudo docker ...`. |
| `bind: address already in use` | Puerto ocupado en el host. | `sudo ss -tlnp \| grep <puerto>` para identificar; cambiar mapping o matar el proceso. |
| `invalid spec: :/usr/src/app/uploads: empty section between colons` | Variables `${...}` no resueltas. | El archivo de variables debe llamarse `.env` exacto, o usar `--env-file backend/.env`. |
| Logs JSON crecen sin límite | Sin rotación de Winston. | Workaround manual: `truncate -s 0 backend/logs/*.json`. Fix planeado en [`../analysis/scaling.md`](../analysis/scaling.md). |
| Imágenes no se ven en frontend | Volumen montado vacío o nginx no proxy `/api/images`. | Verificar mount + revisar nginx upstream. |
