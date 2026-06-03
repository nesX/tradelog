# Variables de entorno — referencia exhaustiva

Tres archivos relevantes:

| Path | Propósito |
|------|-----------|
| `trading-journal/backend/.env` | Backend en dev. Plantilla en `.env.example`. |
| `trading-journal/frontend/.env` | Frontend en dev (variables `VITE_*`). Plantilla en `.env.example`. |
| `trading-journal/.env` (prod) | Único archivo en la VPS. Plantilla en `.env.prod.example`. |

> **Importante**: en producción Docker Compose solo lee el archivo llamado **exactamente** `.env` (no `.env.prod`, no `.env.tradelog`). Ver [`troubleshooting.md`](troubleshooting.md).

## Variables del backend

Validadas por Joi en `src/config/env.js`. Si falta alguna requerida, el server **no arranca**.

| Variable | Tipo | Required | Default | Notas |
|----------|------|----------|---------|-------|
| `NODE_ENV` | enum | no | `development` | `development` \| `production` \| `test`. Cambia logs (colores en dev, JSON en prod) y mensajes de error (en dev incluye stack). |
| `PORT` | int | no | `5000` | Puerto donde escucha Express. **El compose dev lo override a `3000`**. En prod (`docker-compose.prod.yml`) lo override a `3002`. |
| `DB_HOST` | string | no | `localhost` | En Docker, lo setea el compose a `db` o `postgres` según corresponda. |
| `DB_PORT` | int | no | `5432` | |
| `DB_NAME` | string | **sí** | — | Nombre de la base. Dev: `trading_journal`. Prod: `tradelog`. |
| `DB_USER` | string | **sí** | — | Dev: `postgres`. Prod: `tradelog_user` (usuario dedicado en el postgres compartido). |
| `DB_PASSWORD` | string | **sí** | — | |
| `UPLOAD_DIR` | string | no | `./uploads` | Directorio local de imágenes. Servido en `/api/images/*`. |
| `MAX_FILE_SIZE` | int (bytes) | no | `5242880` (5MB) | Tamaño máximo de imagen subida. **Nota**: el `errorHandler` muestra hardcoded "1MB" en el mensaje de error — inconsistencia documentada. |
| `ALLOWED_ORIGINS` | string (CSV) | no | `http://localhost:5173` | Lista coma-separada de orígenes permitidos por CORS. Se parsea con `.split(',')`. |
| `LOG_LEVEL` | enum | no | `info` | `error` \| `warn` \| `info` \| `debug`. |
| `LOG_DIR` | string | no | `./logs` | Donde Winston escribe JSON. |
| `JWT_SECRET` | string | **sí** | — | Secreto para firmar JWTs. **Usar string aleatorio ≥32 chars en prod.** Si cambia, todas las sesiones se invalidan. |
| `JWT_EXPIRES_IN` | string | no | `7d` | Formato de `jsonwebtoken`. `7d`, `12h`, `30m`, etc. |
| `GOOGLE_CLIENT_ID` | string | **sí** | — | Audience al validar el `id_token` de Google. |
| `SUPER_ADMIN_EMAIL` | email | no | — | Si está set, el usuario con ese email recibe `role = 'super_admin'` al arrancar. |
| `FRONTEND_URL` | URL | no | `http://localhost:5173` | Reservado para redirects (actualmente no se usa para redirects, pero es leído por `config.frontendUrl`). |

## Variables del frontend (build-time)

Las `VITE_*` son **embedidas en el bundle JS al compilar** (`vite build`). No son variables de runtime — cambiarlas en producción requiere re-build.

| Variable | Required | Notas |
|----------|----------|-------|
| `VITE_API_URL` | sí | Base URL del backend. Dev: `http://localhost:5000`. Prod: vacío (mismo host vía nginx) o URL completa. |
| `VITE_GOOGLE_CLIENT_ID` | sí | Mismo Client ID que `GOOGLE_CLIENT_ID` del backend. En el compose prod se pasa como `build.args` para que esté disponible al `npm run build`. |

> En `Dockerfile.prod` debe declararse como `ARG` y `ENV` antes del `RUN npm run build`:
> ```dockerfile
> ARG VITE_GOOGLE_CLIENT_ID
> ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
> ARG VITE_API_URL
> ENV VITE_API_URL=$VITE_API_URL
> RUN npm run build
> ```

## Variables solo en `.env.prod.example`

| Variable | Notas |
|----------|-------|
| `HOST_UPLOADS_DIR` | Path absoluto en la VPS para el volumen de uploads. Default `/home/deploy/tradelog-data/uploads`. |
| `HOST_LOGS_DIR` | Path absoluto en la VPS para el volumen de logs. Default `/home/deploy/tradelog-data/logs`. |

Estas no las lee el código de Node — solo Docker Compose para resolver los `volumes:`. **Por eso el archivo debe llamarse `.env`** (no se le pasa `--env-file` en prod): Compose carga `./.env` automáticamente para resolver `${HOST_UPLOADS_DIR}` ANTES de iniciar los servicios.

## Generación de secretos seguros

```bash
# JWT_SECRET (32 bytes en base64)
openssl rand -base64 32

# Contraseña de DB
openssl rand -base64 24
```

## Checklist por entorno

### Dev local (Docker)

Mínimo en `backend/.env`:

```ini
DB_NAME=trading_journal
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=desarrollo-no-seguro-cualquier-cosa
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
SUPER_ADMIN_EMAIL=tu-email@gmail.com
```

`frontend/.env` (lo lee Vite dev server):

```ini
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
```

> En el compose dev, el backend se expone en `localhost:3000` (override del PORT a 3000). Si usás Docker, ajustar `VITE_API_URL=http://localhost:3000`. Si usás setup manual, `5000`.

### Prod (VPS)

Único `.env` en `trading-journal/.env` (basado en `.env.prod.example`):

```ini
DB_NAME=tradelog
DB_USER=tradelog_user
DB_PASSWORD=<secret>
JWT_SECRET=<random-32-bytes>
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
FRONTEND_URL=https://tradelog.nesx.co
ALLOWED_ORIGINS=https://tradelog.nesx.co
HOST_UPLOADS_DIR=/home/deploy/tradelog-data/uploads
HOST_LOGS_DIR=/home/deploy/tradelog-data/logs
```
