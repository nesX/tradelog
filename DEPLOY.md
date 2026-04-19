# Deploy Guide — tradelog.nesx.co

Entorno objetivo: VPS con `market-tracker` ya corriendo (postgres, redis, nginx).  
La base de datos de tradelog se aloja en el **mismo contenedor postgres** de market-tracker.

---

## 0. Variables de entorno en la VPS

Cada proyecto tiene su propio `.env`. En la VPS los archivos quedan así:

```
~/market-tracker/.env                    ← variables de market-tracker (existente)
~/tradelog/trading-journal/.env.prod     ← variables de tradelog (crear)
```

El compose carga solo `./.env.prod`. No se carga el `.env` de market-tracker porque
tiene variables con los mismos nombres (`GOOGLE_CLIENT_ID`, `FRONTEND_URL`, etc.) que
pisarían las de tradelog.

La conexión al postgres compartido se logra únicamente por la red Docker (`market-tracker_internal`)
y el hostname `postgres` se fuerza en `environment:` del compose, sin necesidad de leer
las credenciales del otro proyecto.

Copiá el example y completá los valores reales:

```bash
cp .env.prod.example .env.prod
nano .env.prod
```

Ver `.env.prod.example` para referencia de todas las variables necesarias.

---

## 1. Preparar la base de datos en el postgres existente

### 1a. Exportar la BD local

```bash
# En local, desde trading-journal/
pg_dump -U postgres -d trading_journal -F c -f tradelog_backup.dump

# O desde el contenedor local si usás Docker:
docker exec tradelog-db pg_dump -U <DB_USER> -d <DB_NAME> -F c -f /tmp/tradelog_backup.dump
docker cp tradelog-db:/tmp/tradelog_backup.dump ./tradelog_backup.dump
```

### 1b. Subir el dump a la VPS

```bash
scp tradelog_backup.dump deploy@<IP_VPS>:~/tradelog/
```

### 1c. Crear usuario y base de datos en el postgres de market-tracker

```bash
# En la VPS
docker exec -it market-tracker-postgres-1 psql -U postgres

# Dentro de psql:
CREATE USER tradelog_user WITH PASSWORD 'CAMBIAR_PASSWORD_SEGURO';
CREATE DATABASE tradelog OWNER tradelog_user;
\q
```

### 1d. Importar el dump

```bash
# En la VPS
docker cp ~/tradelog/tradelog_backup.dump market-tracker-postgres-1:/tmp/
docker exec -it market-tracker-postgres-1 pg_restore \
  -U tradelog_user -d tradelog -F c /tmp/tradelog_backup.dump

# Si es primera vez (sin datos, sólo schema):
docker exec -i market-tracker-postgres-1 psql -U tradelog_user -d tradelog \
  < ~/tradelog/database/schema.sql
docker exec -i market-tracker-postgres-1 psql -U tradelog_user -d tradelog \
  < ~/tradelog/database/indexes.sql
docker exec -i market-tracker-postgres-1 psql -U tradelog_user -d tradelog \
  < ~/tradelog/database/triggers.sql
docker exec -i market-tracker-postgres-1 psql -U tradelog_user -d tradelog \
  < ~/tradelog/database/views.sql
```

---

## 2. Modificar docker-compose.yml para producción

El `docker-compose.yml` de tradelog **no incluye el servicio `db`** — se conecta al
postgres de market-tracker a través de su red Docker.

Ver archivo: `docker-compose.prod.yml` (en la raíz de este proyecto).

Cambios clave respecto al compose de desarrollo:
- Se elimina el servicio `db`
- El backend usa puerto `3002` (3000 y 3001 ya están ocupados)
- El frontend usa un build multi-stage con nginx interno (puerto `5174`)
- Se declara la red externa `market-tracker_internal` para acceder al postgres

---

## 3. Construir y levantar en la VPS

```bash
# En la VPS, desde ~/tradelog/trading-journal/
sudo docker compose -f docker-compose.prod.yml up -d --build

# Verificar que los contenedores están corriendo
sudo docker compose -f docker-compose.prod.yml ps

# Ver logs del backend
sudo docker logs tradelog-backend -f
```

---

## 4. Configurar nginx para tradelog.nesx.co

### 4a. Crear el archivo de configuración

```bash
sudo nano /etc/nginx/sites-available/tradelog.nesx.co
```

Contenido:

```nginx
server {
    listen 80;
    server_name tradelog.nesx.co;

    # Redirige todo HTTP → HTTPS (se agrega después del certbot)
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name tradelog.nesx.co;

    # Certificados SSL (generados con certbot, paso 4b)
    ssl_certificate     /etc/letsencrypt/live/tradelog.nesx.co/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tradelog.nesx.co/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Frontend (contenedor nginx interno de tradelog)
    location / {
        proxy_pass         http://127.0.0.1:5174;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # API backend
    location /api/ {
        proxy_pass         http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Para uploads grandes
        client_max_body_size 20M;
    }
}
```

### 4b. Activar el sitio y obtener certificado SSL

```bash
sudo ln -s /etc/nginx/sites-available/tradelog.nesx.co \
           /etc/nginx/sites-enabled/

# Verificar configuración
sudo nginx -t

# Recargar nginx
sudo systemctl reload nginx

# Obtener certificado SSL (certbot)
sudo certbot --nginx -d tradelog.nesx.co
```

---

## 5. Checklist post-deploy

- [ ] `docker compose ps` muestra backend y frontend `Up`
- [ ] `docker logs tradelog-backend` sin errores de conexión a BD
- [ ] `https://tradelog.nesx.co` carga el frontend
- [ ] `https://tradelog.nesx.co/api/health` responde `{ success: true }`
- [ ] Login con usuario/contraseña funciona
- [ ] Login con Google funciona (verificar callback URL en Google Console)
- [ ] Upload de imágenes funciona y persiste en el volumen

---

## 6. Actualizaciones futuras

```bash
# En la VPS, desde ~/tradelog/trading-journal/
git pull
sudo docker compose -f docker-compose.prod.yml up -d --build backend
# (o --build frontend si hubo cambios en el frontend)
```

---

## Estructura de archivos en la VPS

```
~/tradelog/
├── trading-journal/
│   ├── backend/
│   ├── frontend/
│   ├── database/
│   ├── docker-compose.prod.yml
│   ├── .env.prod.example     ← plantilla commiteada
│   ├── .env.prod             ← variables reales (NO commitear, en .gitignore)
│   └── ...
└── tradelog_backup.dump      ← dump inicial (puede eliminarse luego)
```
