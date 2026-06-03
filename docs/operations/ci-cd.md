# CI/CD

Workflow único en `.github/workflows/deploy.yml`. Trigger: push a `main`.

**No hay tests automatizados ni lint en CI** — solo despliegue. Lint y tests son responsabilidad del dev local.

## Flujo

```
push a main
    │
    ▼
job: changes (detect-changes)
    │  · dorny/paths-filter@v3
    │  · outputs.backend  = ¿cambió algo en trading-journal/backend/** o docker-compose.prod.yml?
    │  · outputs.frontend = idem frontend
    ▼
job: deploy (solo si backend OR frontend cambió)
    │
    │ SSH a la VPS (appleboy/ssh-action)
    │   cd $VPS_PROJECT_PATH
    │   git pull origin main
    │   if backend changed:  docker compose -f docker-compose.prod.yml up -d --build backend
    │   if frontend changed: docker compose -f docker-compose.prod.yml up -d --build frontend
    │   docker image prune -f
    │   sleep 15
    │   for service in REBUILT: docker inspect → ¿State.Running=true?
    │   si alguno falló → POST market-tracker:3001 /api/send-alert (mensaje ⚠)
    │   si todo OK   → POST market-tracker:3001 /api/send-alert (mensaje ✅)
    ▼
on: failure → SSH al VPS de nuevo y POST alerta ❌
```

## Secrets requeridos en GitHub

Configurar en `Settings → Secrets and variables → Actions`:

| Secret | Para qué |
|--------|----------|
| `VPS_HOST` | Hostname o IP del servidor. |
| `VPS_USER` | Usuario SSH (típicamente `deploy`). |
| `VPS_SSH_KEY` | Llave privada SSH con acceso al servidor. |
| `VPS_PORT` | Puerto SSH (típicamente `22`). |
| `VPS_PROJECT_PATH` | Path absoluto en la VPS (e.g. `/home/deploy/tradelog/trading-journal`). |

## Notificaciones

El workflow llama a un endpoint del proyecto **market-tracker** (corriendo en la misma VPS, puerto `3001`):

```
POST http://localhost:3001/api/send-alert
{ "message": "✅ Tradelog deploy exitoso [backend] — 2026-05-28 12:34" }
```

Si market-tracker no está corriendo, las alertas fallan silenciosamente (curl `-s`) — el resto del deploy no se afecta. Hay también un job `failure()` que dispara la alerta de fallo en caso de error general del job.

> Si vas a publicar tradelog independientemente, conviene desacoplar este notificador. Reemplazar el POST por un webhook de Discord/Slack/Telegram. Anotado en [`../pending-decisions.md`](../pending-decisions.md) D-012.

## Detect-changes

Filtros actuales (en `.github/workflows/deploy.yml`):

```yaml
backend:
  - 'trading-journal/backend/**'
  - 'trading-journal/docker-compose.prod.yml'
frontend:
  - 'trading-journal/frontend/**'
  - 'trading-journal/docker-compose.prod.yml'
```

**Limitaciones**:

- Cambios solo en `database/` **no disparan ningún deploy** — las migraciones se aplican a mano. Si esto te incomoda, agregar un filtro `database:` y un step `docker exec ... psql < ...sql` (con cuidado, hay que tener atomicidad y rollback). Decisión pendiente en [`../pending-decisions.md`](../pending-decisions.md) D-013.
- Cambios en `docs/` no triggerean nada, lo cual es bueno (la doc no necesita deploy).
- Cambios en `CLAUDE.md` o `README.md` raíz tampoco.

## Health check post-deploy

Tras el rebuild, el script espera 15s y luego inspecciona los contenedores con `docker inspect`. Si `State.Running != true` para alguno de los servicios reconstruidos, marca el deploy como fallido y notifica.

**Limitación**: solo chequea que el contenedor esté corriendo, no que responda HTTP. Un backend que arranca pero crashea en el primer request no se detecta. Mejorable con `curl http://localhost:3002/api/health` en el script. Cambio trivial.

## Cómo añadir un nuevo path de detección

Editar `.github/workflows/deploy.yml`:

```yaml
filters: |
  backend:
    - 'trading-journal/backend/**'
    - 'trading-journal/docker-compose.prod.yml'
  frontend:
    - 'trading-journal/frontend/**'
    - 'trading-journal/docker-compose.prod.yml'
  # Añadir:
  database:
    - 'trading-journal/database/**'
```

Y agregar lógica que use `needs.changes.outputs.database`.

## Rollback

No hay rollback automatizado. Si un deploy rompe:

```bash
# En la VPS
cd ~/tradelog/trading-journal
git log --oneline -5
git checkout <commit-anterior>
sudo docker compose -f docker-compose.prod.yml up -d --build
# Luego git checkout main; git revert <bad-commit>; git push
```

Mejora propuesta: tagear cada deploy exitoso con `deploy-<timestamp>` para facilitar rollback. Ver [`../roadmap.md`](../roadmap.md).
