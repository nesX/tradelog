# Getting Started

Esta guía te lleva de cero a una app funcional corriendo localmente. Para producción ver [`operations/deployment.md`](operations/deployment.md).

---

## Pre-requisitos

| Herramienta | Versión mínima | Notas |
|-------------|----------------|-------|
| Node.js | 18.0.0 | Backend usa `node --watch` y `--experimental-vm-modules` |
| PostgreSQL | 14 (16 recomendado en compose) | Solo si NO usás Docker |
| Docker + Docker Compose | reciente | Recomendado para dev — automatiza la BD |
| npm | viene con Node |  |
| Google Cloud Console | — | Para crear un OAuth Client ID |

### Crear Google OAuth Client ID

1. https://console.cloud.google.com/ → Crear proyecto.
2. APIs & Services → Credentials → "Create Credentials" → "OAuth client ID" → tipo "Web application".
3. Authorized JavaScript origins: `http://localhost:5173`.
4. Authorized redirect URIs: no son necesarios (usamos `id_token` flow).
5. Copiar el Client ID (formato `xxx.apps.googleusercontent.com`).

---

## Ruta A — Docker Compose (recomendada)

Una sola red, un comando, postgres efímero con volumen persistente.

```bash
# Desde la raíz del repo
cd trading-journal/backend
cp .env.example .env
$EDITOR .env
```

Variables **mínimas a completar** en `backend/.env`:

```ini
DB_NAME=trading_journal
DB_USER=postgres
DB_PASSWORD=elige_uno_seguro
JWT_SECRET=cadena-larga-aleatoria-32-chars-min
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
SUPER_ADMIN_EMAIL=tu-email@gmail.com
```

> `SUPER_ADMIN_EMAIL` se usa al arrancar para crear/actualizar el usuario super_admin con ese email — el primer login con Google de ese correo te da control administrativo.

Levantá todo:

```bash
cd /projects/tools/tradelog/trading-journal
sudo docker compose --env-file backend/.env up -d --build
```

Esto arranca tres contenedores:

| Servicio | Container | Puerto host | Notas |
|----------|-----------|-------------|-------|
| `db` | `tradelog-db` | `5433` | Postgres 16 con volumen `tradelog_db_data` |
| `backend` | `tradelog-backend` | `3000` | Express con `npm run dev` (watch) |
| `frontend` | `tradelog-frontend` | `5173` | Vite dev server, `VITE_API_URL=http://localhost:3000` |

> El backend dentro del contenedor escucha el puerto `3000` (override del compose), aunque el código por defecto usa 5000. El compose mapea `127.0.0.1:3000:3000`.

### Inicializar el schema

El compose **no carga el schema automáticamente**. Ejecutalo una sola vez:

```bash
cd /projects/tools/tradelog/trading-journal

# Carga todos los archivos SQL en orden (001 a 023)
for f in database/0*.sql; do
  sudo docker exec -i tradelog-db psql -U postgres -d trading_journal < "$f"
done
```

Verificar tablas:

```bash
sudo docker exec -it tradelog-db psql -U postgres -d trading_journal -c "\dt"
```

Deberías ver: `trades`, `trade_images`, `users`, `systems`, `signals`, `notes`, `note_blocks`, `backtest_sessions`, etc.

### Smoke test

```bash
# Health check
curl http://localhost:3000/api/health
# → { "success": true, "data": { "status": "ok", "environment": "development" } }

# Frontend
open http://localhost:5173
```

Hacer login con Google con el correo de `SUPER_ADMIN_EMAIL`. Deberías ver el menú con `Home`, `Crear`, `Stats`, `Notes`, `Review`, `Backtest`, `Settings`, y `Admin/Users` (este último solo si sos super_admin).

---

## Ruta B — Setup manual (sin Docker)

Solo si querés correr todo nativo y ya tenés Postgres instalado.

### 1. Base de datos

```bash
createdb trading_journal

cd /projects/tools/tradelog/trading-journal
for f in database/0*.sql; do
  psql -d trading_journal -f "$f"
done
```

### 2. Backend

```bash
cd /projects/tools/tradelog/trading-journal/backend
cp .env.example .env
$EDITOR .env   # ajustar DB_HOST=localhost, DB_PORT=5432, etc.
npm install
npm run dev
```

Por defecto escucha en `http://localhost:5000`.

### 3. Frontend

```bash
cd /projects/tools/tradelog/trading-journal/frontend
cp .env.example .env
$EDITOR .env   # VITE_API_URL=http://localhost:5000, VITE_GOOGLE_CLIENT_ID=...
npm install
npm run dev
```

Disponible en `http://localhost:5173`.

---

## Primer trade

1. Login con Google.
2. Click en "Crear" → completar símbolo, tipo, precios, cantidad, fechas. Opcionalmente agregar imágenes (drag & drop, se comprimen automáticamente a WebP en el cliente).
3. Volvé a Home — deberías verlo en la tabla.

Para importar desde un CSV existente: Home → botón "Importar CSV". Formato detallado en [`api/csv-format.md`](api/csv-format.md).

---

## Comandos útiles del día a día

```bash
# Logs del backend en tiempo real (Docker)
sudo docker logs tradelog-backend -f

# Entrar a la BD
sudo docker exec -it tradelog-db psql -U postgres -d trading_journal

# Aplicar una nueva migración
sudo docker exec -i tradelog-db psql -U postgres -d trading_journal < trading-journal/database/024_mi_migracion.sql

# Re-build solo el backend tras cambios en deps
sudo docker compose --env-file backend/.env up -d --build backend

# Lint
cd trading-journal/backend && npm run lint
cd trading-journal/frontend && npm run lint
```

Más en [`operations/docker.md`](operations/docker.md).

---

## Problemas comunes

- **`invalid spec: :/usr/src/app/uploads`** al levantar compose en producción → el archivo de variables debe llamarse exactamente `.env`. Ver [`operations/troubleshooting.md`](operations/troubleshooting.md).
- **"Google Client ID no configurado"** en login → falta `VITE_GOOGLE_CLIENT_ID` en el `.env` del frontend. En producción debe estar disponible al hacer `vite build` (no es una variable de runtime).
- **Backend no arranca, Joi error** → falta alguna variable required (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`).
- **401 en cualquier endpoint** tras login → el token JWT está expirado o el `JWT_SECRET` cambió. Logout + login resuelve.

---

## Próximos pasos

- Aprender la arquitectura: [`architecture/overview.md`](architecture/overview.md).
- Explorar endpoints: [`api/reference.md`](api/reference.md).
- Cómo contribuir al código: [`development/workflow.md`](development/workflow.md).
