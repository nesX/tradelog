# Auditoría de seguridad — Trading Journal

> **Audiencia**: el dueño del proyecto antes de publicar. Enumera los gaps detectados en el código actual y los cruza con el plan en [`scaling.md`](scaling.md) que los resuelve.

> **Severidad** usada: 🔴 crítico (bloquea publicación) · 🟡 alto (resolver antes de aceptar usuarios externos) · 🟢 medio (mejorar para profesionalizar).

---

## Resumen ejecutivo

5 gaps **críticos** y 4 **altos** que conviene cerrar antes de publicar. Todos tienen fixes conocidos y de bajo costo. La mayoría se resuelve en la Fase 0 de [`scaling.md`](scaling.md#fase-0--hardening-pre-publicación).

| Gap | Severidad | Esfuerzo | Resuelve |
|-----|-----------|----------|----------|
| Sin rate limiting | 🔴 | Bajo | `scaling.md` F0 |
| Logs sin rotación | 🔴 | Bajo | `scaling.md` F0 |
| Validación de imágenes solo MIME/extensión | 🔴 | Bajo | `scaling.md` F0 |
| Mensaje de error con tamaño incorrecto | 🟢 | Trivial | `scaling.md` F0 |
| CORS dinámico desde env | 🟡 | Trivial | Ya OK si `ALLOWED_ORIGINS` se setea bien en prod |
| JWT sin revocación | 🟡 | Medio | `scaling.md` F5 / decisión D-006 |
| Imágenes públicas por URL | 🟡 | Medio | Decisión D-016 |
| Token en `localStorage` | 🟡 | Alto (refactor) | Decisión D-017 |
| Bootstrap super_admin frágil | 🟢 | Bajo | Documentar + mitigación |
| Helmet CSP permisiva | 🟢 | Medio | `scaling.md` F0 |
| Sin captcha en login | 🟢 | Medio | Considerar post-publicación |

---

## Detalle por gap

### 🔴 1. Sin rate limiting

**Síntoma**: el backend no usa `express-rate-limit` ni similar. Cualquier IP puede pegarle a `/api/auth/google`, `/api/trades/import`, `/api/notes/*` sin límite.

**Riesgo**:
- Brute-force sobre auth (mitigado parcialmente porque Google rate-limita su lado).
- DoS por abuso de CSV import (cada llamada parsea + valida potencialmente miles de filas).
- Costo de CPU descontrolado en endpoints de stats si alguien polea cada segundo.

**Fix**:
- Instalar `express-rate-limit`.
- Límites granulares por endpoint sensible. Ver detalles en [`scaling.md` Fase 0](scaling.md#fase-0--hardening-pre-publicación).
- Cabezeras `X-RateLimit-*` para que el frontend pueda mostrar feedback.

---

### 🔴 2. Logs sin rotación

**Síntoma**: Winston escribe a `logs/error.log` y `logs/combined.log` sin tope ni rotación. En prod los volúmenes (`${HOST_LOGS_DIR}`) crecerán hasta llenar el disco de la VPS.

**Riesgo**: cuando el disco se llena, **todo el host** muere (no solo Tradelog — también `market-tracker` que comparte la máquina).

**Fix**:
- Reemplazar transport de archivo por `winston-daily-rotate-file` con maxFiles=14, maxSize=20m, zippedArchive.
- Alternativa zero-code: `logrotate` en `/etc/logrotate.d/tradelog`:
  ```
  /home/deploy/tradelog-data/logs/*.log {
    daily
    rotate 14
    compress
    missingok
    copytruncate
  }
  ```

---

### 🔴 3. Validación de imágenes solo MIME/extensión

**Síntoma**: `middleware/upload.js` chequea `file.mimetype ∈ {jpeg,png,webp,gif}` y la extensión del filename. **Ambos son trivialmente falsificables** por el cliente.

**Riesgo**:
- Subida de archivos maliciosos disfrazados de imagen.
- Image-bomb: PNG válido pero gigante en dimensiones (e.g. 50000×50000) que al renderizar consume RAM.
- Aunque la imagen se sirve estáticamente y nunca se decodifica server-side, igual ocupa espacio y puede romper el frontend.

**Fix**:
- Instalar `file-type` (npm) y verificar **magic bytes** del archivo recibido.
- Opcional: `sharp` para decodificar metadata y rechazar dimensiones absurdas (>4000×4000) o tamaño tras decompress.

```js
import fileType from 'file-type';
const type = await fileType.fromFile(file.path);
if (!ALLOWED_MIME_TYPES.includes(type?.mime)) {
  await fs.unlink(file.path);
  throw new ValidationError('Imagen inválida');
}
```

---

### 🟢 4. Mensaje de error con tamaño incorrecto

**Síntoma**: en `middleware/errorHandler.js`:

```js
if (err.code === 'LIMIT_FILE_SIZE') {
  return sendError(res, 'El archivo excede el tamaño máximo de 1MB', 400, 'FILE_TOO_LARGE');
}
```

El mensaje dice "1MB" pero el límite real (`MAX_FILE_SIZE`) es 5MB por default.

**Riesgo**: ninguno técnico — solo confunde al usuario.

**Fix**: usar `config.upload.maxFileSize` en el mensaje:

```js
const sizeMB = (config.upload.maxFileSize / 1024 / 1024).toFixed(0);
return sendError(res, `El archivo excede el tamaño máximo de ${sizeMB}MB`, ...);
```

---

### 🟡 5. CORS dinámico desde env

**Síntoma**: `ALLOWED_ORIGINS` se carga del env y se separa por coma. Si en algún momento se setea a `*` o se incluye un origen amigo (e.g. localhost en prod), queda abierto.

**Riesgo**: medio — depende de operativa. Hoy el `.env.prod.example` correctamente apunta solo a `https://tradelog.nesx.co`.

**Fix**:
- Documentar (hecho en `docs/operations/env-vars.md`) que `ALLOWED_ORIGINS` debe ser una lista cerrada en prod.
- Considerar validación: rechazar `*` en NODE_ENV=production.
- Auditar manualmente el `.env` de prod cada vez que se cambia algo.

---

### 🟡 6. JWT sin revocación

**Síntoma**: `auth.service.verifyToken` solo verifica firma y expiración. `POST /api/auth/logout` no invalida el token, solo le dice al cliente "olvidate".

**Riesgo**:
- Si un token es robado (XSS, dispositivo perdido), vale 7 días.
- Logout "forzado" del usuario por el admin: imposible.
- Cambiar la contraseña del usuario (no aplica aquí, usamos Google) no expulsa tokens vigentes.

**Fix (Capa 1)**:

```sql
CREATE TABLE jwt_revocations (
  jti UUID PRIMARY KEY,
  user_id INTEGER NOT NULL,
  revoked_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);
CREATE INDEX ON jwt_revocations (expires_at);
```

- Agregar `jti: crypto.randomUUID()` al payload del JWT.
- En `authenticate` middleware: chequear `SELECT 1 FROM jwt_revocations WHERE jti = $1`. Cachear hits en LRU local (1 min TTL) para no pegar a la BD cada request.
- En `logout`: insertar el `jti` actual.
- Cron diario que borra `WHERE expires_at < NOW()`.

**Fix (Capa 2, alternativo)**: en lugar de revocación per-token, usar `users.session_version` (int). El token lleva la versión actual; si la versión cambia, todos los tokens viejos quedan inválidos.

Trade-off: revocación granular vs simple. Decisión pendiente: [`../pending-decisions.md`](../pending-decisions.md) D-006.

---

### 🟡 7. Imágenes accesibles por URL pública

**Síntoma**: `GET /api/images/:filename` es **público** (sin `authenticate`). Filenames son UUID + timestamp — no adivinables, pero **una vez que conocés un filename podés acceder sin auth**. Cualquier usuario puede compartir el filename con quien quiera.

**Riesgo**:
- Medio. Si un usuario sube una imagen sensible (estado de cuenta, info personal), y luego la borra, **el archivo físico sigue ahí** (no se borra del filesystem hasta cleanup manual) y sigue accesible para cualquiera con el filename.
- Sin embargo, los URLs **no se filtran** fácilmente (no aparecen en search engines).

**Fix opciones**:

A) **Auth en images**: agregar `authenticate` al middleware estático. Requiere que el frontend pida la imagen con header `Authorization`. Problema: `<img src="..." />` no soporta headers. Solución: descargar la imagen vía fetch + `URL.createObjectURL(blob)`.

B) **Signed URLs**: generar URL firmadas con TTL (e.g. `/api/images/:filename?token=...&expires=...`). El endpoint verifica firma. Más complejo pero soluciona el `<img>`.

C) **Aceptar el modelo actual** y documentar: las imágenes son "no enumerables" pero "no privadas". OK para captures de charts, no OK para info financiera.

Decisión pendiente: D-016.

---

### 🟡 8. Token JWT en `localStorage`

**Síntoma**: `api/client.js` lee `localStorage.getItem('token')`. Cualquier script XSS en la página puede leer el token.

**Riesgo**: alto si hay vulnerabilidad XSS. Tradelog hoy renderiza `notes` con `react-markdown` + `remark-gfm` — librerías serias, pero sanitización de HTML embebido en markdown es una superficie no trivial.

**Fix**: mover el token a una `httpOnly` cookie. Requiere:
- Backend setea `Set-Cookie: token=...; HttpOnly; Secure; SameSite=Strict`.
- Frontend no maneja el token; el browser lo manda automáticamente.
- Protección contra CSRF: añadir CSRF token (e.g. `csurf` middleware o double-submit cookie pattern).
- Cambia el flow de logout (DELETE de la cookie en el server).

**Esfuerzo**: 2-3 días por refactor.

Decisión pendiente: D-017. Recomendación tentativa: hacerlo cuando el primer usuario externo entre.

---

### 🟢 9. Bootstrap del super_admin frágil

**Síntoma**: `initSuperAdmin()` (`src/services/admin.service.js`) lee `SUPER_ADMIN_EMAIL` del env al arrancar. Si la env se pierde o cambia:

- El super_admin existente **no pierde su rol** (no se "demote").
- Si nadie tiene super_admin actualmente y la env queda vacía, no hay forma desde la UI de promover a alguien.

**Riesgo**: bajo en operación normal. Alto si hay rotación de credenciales sin cuidado.

**Fix recomendado**:
- Documentar (hecho en `docs/architecture/auth.md`) el comportamiento.
- Añadir comando admin de emergencia: script `node scripts/promote-user.js <email>` que actualiza el rol en la BD. Solo ejecutable con acceso al server.

---

### 🟢 10. Helmet CSP permisiva

**Síntoma**: en `server.js`:
```js
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
```

Solo se configura `crossOriginResourcePolicy` (necesario para que el frontend incruste imágenes del backend). El resto de Helmet usa defaults — incluye CSP relativamente permisiva.

**Riesgo**: vectores XSS / clickjacking marginales.

**Fix**:

```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://accounts.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind necesita inline en algunos casos
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],  // permitir Google avatars
      connectSrc: ["'self'", 'https://accounts.google.com'],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
```

Probar exhaustivo — CSP rota cosas si está mal configurada.

---

### 🟢 11. Sin captcha en login

**Síntoma**: el botón "Iniciar sesión con Google" no tiene captcha previo.

**Riesgo**: bajo en práctica — Google ya tiene su propio captcha y rate limiting. Tener uno propio solo añade fricción innecesaria.

**Fix**: no hacer. Solo considerar si Google empieza a rechazar requests por ser sospechosos del servidor.

---

## Mitigaciones que ya hace el código (positivas)

- ✅ **Helmet** habilitado (aunque mejorable).
- ✅ **CORS configurable** desde env.
- ✅ **Joi validation** en TODOS los endpoints con body/query/params.
- ✅ **Queries SQL parametrizadas** en todos los repositories (sin string concatenation).
- ✅ **Soft-delete** en `trades` (mitigación contra eliminación accidental).
- ✅ **Compresión de imágenes** client-side (reduce ataque por tamaño).
- ✅ **Errores de PG mapeados** a respuestas no-leakeantes (`23505` → 409 sin exponer SQL).
- ✅ **Stack trace solo en development** (NODE_ENV=production lo oculta).
- ✅ **`user: "1000:1000"`** en compose: backend no corre como root.
- ✅ **Backend bind a `127.0.0.1`** en prod: solo accesible via nginx.

---

## Plan de remediación priorizado

Si vas a publicar la app en las próximas semanas:

### Bloque 1 — antes de aceptar usuarios externos (1 semana)

- [ ] Rate limiting (gap 1).
- [ ] Rotación de logs (gap 2).
- [ ] Validación real de imágenes con `file-type` y/o `sharp` (gap 3).
- [ ] Corregir mensaje "1MB" (gap 4).
- [ ] CSP estricta en Helmet (gap 10).
- [ ] Script de promoción de admin de emergencia (gap 9).
- [ ] Health check con verificación de DB (cross-link a [`scaling.md`](scaling.md)).

### Bloque 2 — pre-escalado (siguiente mes)

- [ ] JWT revocation list (gap 6, decisión D-006).
- [ ] Decisión sobre imágenes privadas (gap 7, decisión D-016).

### Bloque 3 — endurecimiento mayor (cuando haya volumen real)

- [ ] Migrar JWT a httpOnly cookie + CSRF (gap 8, decisión D-017).
- [ ] Auditoría externa de penetración (paga, ~USD 1-3k).
- [ ] Bug bounty program si la app maneja datos sensibles reales.

---

## Lo que **no** preocupa hoy

- **SQL injection**: pg parametriza queries; no hay risk con el patrón actual.
- **XSS por contenido de notas**: react-markdown + remark-gfm sanitizan por default. Verificar que no se usa `dangerouslySetInnerHTML` en otros lados.
- **CSRF**: con tokens en headers (no cookies), no es relevante. Cambia si se migra a httpOnly cookies (gap 8).
- **Dependencias vulnerables**: ejecutar `npm audit` periódicamente. Hoy no se reporta nada crítico (todas las deps son maintained).
