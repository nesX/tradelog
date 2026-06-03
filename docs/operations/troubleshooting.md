# Troubleshooting

Errores comunes y cómo resolverlos. Consolida la sección 7 del deploy original + síntomas detectados en el código.

---

## Docker / Compose

### `invalid spec: :/usr/src/app/uploads: empty section between colons`

**Causa**: Docker Compose no resolvió `${UPLOAD_DIR}` o `${HOST_UPLOADS_DIR}` porque el archivo de variables tiene un nombre distinto a `.env`.

**Solución**: el archivo debe llamarse exactamente `.env` en el directorio del compose **o** pasar `--env-file <ruta>` al comando. Compose lee `./.env` automáticamente para resolver interpolaciones ANTES de cargar `env_file:` de cada servicio.

### `bind: address already in use`

**Causa**: el puerto que mapea el compose ya está ocupado por otro proceso.

```bash
sudo ss -tlnp | grep ':3000'
# matar el proceso o cambiar el mapping en docker-compose.yml
```

### `Cannot connect to the Docker daemon`

```bash
sudo systemctl start docker
# y usar sudo en los comandos: sudo docker compose ...
```

### Cambios en código del backend no se reflejan

En el compose dev, `--watch` reinicia Node al detectar cambios. Si no funciona:

- Verificar que el volumen `./backend:/usr/src/app` esté montado correctamente.
- Hacer `sudo docker compose restart backend`.
- En último caso `sudo docker compose down && sudo docker compose --env-file backend/.env up -d --build`.

---

## Frontend

### "Google Client ID no configurado" en login

**Causa en dev**: falta `VITE_GOOGLE_CLIENT_ID` en `frontend/.env`. Reiniciar Vite tras editarlo.

**Causa en prod**: las variables `VITE_*` se embeben en build-time. Si no estaban presentes al `npm run build`, no quedan en el bundle. Solución:

1. Verificar que `.env` (prod) tiene `GOOGLE_CLIENT_ID=...`.
2. Verificar que `docker-compose.prod.yml` pasa la variable como `build.args`:
   ```yaml
   frontend:
     build:
       args:
         VITE_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
         VITE_API_URL: ""
   ```
3. Verificar que `Dockerfile.prod` declara `ARG` + `ENV` ANTES del `RUN npm run build`:
   ```dockerfile
   ARG VITE_GOOGLE_CLIENT_ID
   ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
   RUN npm run build
   ```
4. Rebuild forzado: `sudo docker compose -f docker-compose.prod.yml up -d --build --force-recreate frontend`.

### Imágenes no se ven (404 en `/api/images/*`)

- Verificar que el volumen `uploads/` esté correctamente montado en el backend container.
- En prod, verificar que `${HOST_UPLOADS_DIR}` existe y tiene permisos `uid:1000` (el `user: "1000:1000"` del compose).
- Si nginx hace proxy, asegurar que `location /api/images/` no esté siendo capturado por una regla anterior.

### CORS error en consola del navegador

`Access to XMLHttpRequest at 'http://...' has been blocked by CORS policy`.

- Verificar `ALLOWED_ORIGINS` en el backend coincide con el origen del frontend (incluyendo protocolo).
- En dev: `ALLOWED_ORIGINS=http://localhost:5173`.
- En prod: `ALLOWED_ORIGINS=https://tradelog.nesx.co`.
- Múltiples orígenes: separados por coma sin espacios → `https://a.com,https://b.com`.

---

## Backend / Express

### El proceso no arranca: `Error de configuración: "..." is required`

**Causa**: Joi validó las env vars y falta alguna requerida (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`).

**Solución**: completar la variable. El mensaje de Joi dice cuál.

### `Error al conectar con PostgreSQL`

- ¿La BD está corriendo? `sudo docker ps | grep postgres`.
- ¿Credenciales correctas? Probar manualmente con `psql`.
- En prod: ¿la red `market-tracker_internal` existe y el servicio `postgres` es accesible? `docker network ls | grep market`.

### `401 Unauthorized` en cualquier endpoint

- Token JWT expirado (default 7d). Logout + login.
- `JWT_SECRET` cambió en el servidor → tokens viejos son inválidos.
- Header malformado: debe ser `Authorization: Bearer <token>`, sin comillas, sin "JWT ", etc.

### `413 Payload Too Large` al subir imágenes

- Backend: `express.json({ limit: '10mb' })`. JSON >10MB rechaza.
- Multer: `MAX_FILE_SIZE` env (default 5MB) por archivo, máximo 10 archivos por request.
- Nginx (prod): `client_max_body_size 20M` ya configurado en `docs/operations/deployment.md`. Si subiste mucho más, ampliarlo.

### `LIMIT_FILE_SIZE` o "El archivo excede el tamaño máximo de 1MB"

**Inconsistencia conocida**: el mensaje hardcoded dice "1MB" pero el límite real es `MAX_FILE_SIZE` (5MB default). Ignorar el "1MB" del mensaje; el límite efectivo es el del env.

Si la imagen es legítimamente grande: la compresión client-side debería bajarla a <500KB. Verificar que `imageCompression.js` no está fallando silenciosamente (mira `console.warn` en el navegador).

### Logs llenos de "Pool of connections exhausted"

- El pool tiene `max: 20`. Si hay muchos requests simultáneos con queries lentas, se agota.
- Identificar queries lentas con `pg_stat_activity` (ver [`monitoring.md`](monitoring.md)).
- Reiniciar el backend libera todas las conexiones.

---

## Base de datos

### `relation "trades" does not exist`

Faltó cargar el schema. Aplicar las migraciones:

```bash
for f in trading-journal/database/0*.sql; do
  sudo docker exec -i tradelog-db psql -U postgres -d trading_journal < "$f"
done
```

### Errores de FK al borrar trades

`update or delete on table "trades" violates foreign key constraint on table "..."`

Hay tablas con FKs sin `ON DELETE CASCADE` apuntando a `trades`. El proyecto **usa soft-delete (`deleted_at`) en trades** justamente para evitar esto. Si necesitás hard-delete, asegurate de limpiar `trade_images`, `trade_signals`, `note_block_trades` primero.

### Pérdida de datos tras `docker compose down -v`

`-v` borra los volúmenes named (`tradelog_db_data`). Solo usar en dev cuando explícitamente querés resetear todo.

---

## Auth

### `POST /api/auth/google` devuelve 400 `INVALID_TOKEN`

- Verificar que el `audience` del id_token coincide con `GOOGLE_CLIENT_ID` del backend.
- En Google Cloud Console, agregar el origen actual a "Authorized JavaScript origins".
- El id_token expira rápido (~1h) — si pasa mucho tiempo entre que se genera y se envía, falla.

### Después de cambiar `SUPER_ADMIN_EMAIL` no me promociona

`initSuperAdmin()` solo actúa **al arrancar**. Reiniciar el backend (`docker compose restart backend`).

Si el server no encuentra el usuario (porque nunca se logueó con Google), lo crea con `role=super_admin` — el usuario debe loguearse después y la cuenta aplica.

---

## CI/CD

### El deploy "OK" pero la versión no cambió

- `dorny/paths-filter` solo detecta cambios en `trading-journal/backend/**` o `trading-journal/frontend/**`. Cambios en `docs/`, `database/`, o archivos raíz **no triggerean** rebuild.
- Forzar deploy: hacer un cambio trivial (e.g. tocar `trading-journal/backend/src/server.js` con un comentario y commit).

### Alertas de market-tracker no llegan

- Verificar que market-tracker está corriendo: `curl http://localhost:3001/api/send-alert`.
- Si no está, las alertas fallan silenciosamente (curl `-s`). No bloquea el deploy.

---

## Performance

### Stats tardan varios segundos

- Cada endpoint de `/api/stats/*` hace agregaciones SQL sin caching. Con datasets crecidos, esto se nota.
- Soluciones planeadas en [`../analysis/scaling.md`](../analysis/scaling.md): cache LRU in-process, índices compuestos por `user_id`, opcionalmente materialized views.

### Home page lenta tras muchas notas

- TanStack Query no persiste el cache entre sesiones → cada reload re-fetch el árbol completo.
- Solución planeada: `persistQueryClient` con IndexedDB. Ver [`../analysis/offline-strategy.md`](../analysis/offline-strategy.md).

---

## Recursos

- Logs del deploy en GitHub: `https://github.com/<org>/<repo>/actions`.
- Estado de servicios: `sudo docker compose -f docker-compose.prod.yml ps`.
- Salud del backend: `curl https://tradelog.nesx.co/api/health`.

Si nada funciona, restaurar último backup (ver [`database-ops.md`](database-ops.md)) y rollback con `git checkout` (ver [`ci-cd.md`](ci-cd.md#rollback)).
