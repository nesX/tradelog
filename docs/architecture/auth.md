# Arquitectura — Autenticación

Sistema basado en Google OAuth (id_token) + JWT propio. Sin contraseñas.

## Flujo de login

```
┌────────┐         ┌─────────────────────────┐
│ Browser│  ──[1]──▶  Google Identity Services
│        │  ◀──[2]──   id_token (JWT firmado por Google)
└────┬───┘
     │
     │ [3] POST /api/auth/google  { id_token }
     ▼
┌─────────────────────────────────────────┐
│ Backend                                  │
│  authController.loginWithGoogle          │
│  └─ authService.verifyGoogleIdToken      │
│      └─ google-auth-library              │
│         (valida firma, audience, expiry) │
│  └─ userRepository.findByEmail / create  │
│  └─ jwt.sign({ userId, email, role })    │
└─────────────────────────────────────────┘
     │
     │ [4] { success: true, data: { token, user } }
     ▼
┌────────┐
│ Browser│  localStorage.setItem('token', token)
│        │  AuthContext.setUser(user)
└────────┘
```

### Detalle paso a paso

1. El frontend muestra el botón de Google ("Iniciar sesión con Google") que usa Google Identity Services. Configurado con `VITE_GOOGLE_CLIENT_ID` (debe estar disponible en build-time).
2. Google devuelve un `id_token` (JWT firmado por Google) tras consent.
3. El frontend envía `POST /api/auth/google` con el `id_token`. El validator Joi (`googleLoginSchema`) chequea que sea un string.
4. El backend usa `google-auth-library` para validar firma, expiración y `audience` (debe coincidir con `GOOGLE_CLIENT_ID`).
5. Si el email no existe en `users`, se crea. Si existe, se actualiza `name`, `picture`, `last_login_at`.
6. El backend firma su propio JWT con `JWT_SECRET`, payload `{ userId, email, role }`, expira en `JWT_EXPIRES_IN` (default `7d`).
7. El frontend guarda el token en `localStorage` y el user en `AuthContext`.

## Middleware `authenticate`

`src/middleware/auth.js`:

```js
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw new AppError('Token de autenticación requerido', 401, 'AUTH_REQUIRED');

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Formato de token inválido', 401, 'INVALID_TOKEN_FORMAT');
  }

  const payload = authService.verifyToken(token);  // throws si inválido/expirado
  req.user = { id: payload.userId, email: payload.email, role: payload.role || 'user' };
  next();
};
```

Aplicado a TODAS las rutas excepto `POST /api/auth/google` y `GET /api/health`.

También existe `optionalAuth` (no falla si no hay token), pero no se usa actualmente.

## Middleware `authorize`

`src/middleware/authorize.js`:

```js
export const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    throw new AppError('No autorizado', 403, 'FORBIDDEN');
  }
  next();
};
```

Uso: `router.use(authenticate, authorize('admin', 'super_admin'))` en `admin.routes.js`.

## Roles

Tres roles persistidos en `users.role`:

| Rol | Privilegios |
|-----|-------------|
| `user` | Acceso normal: CRUD de sus trades, notas, backtests. |
| `admin` | Lo anterior + acceso a `/api/admin/*` (listar/crear/editar/eliminar usuarios). |
| `super_admin` | Lo anterior. **No removible** por otro admin desde la UI** (validación en service). Bootstrap automático del usuario con `email = SUPER_ADMIN_EMAIL` al arrancar el servidor. |

### Bootstrap del super_admin

`src/services/admin.service.js` → `initSuperAdmin()` llamado en `server.js` al arrancar:

- Si `SUPER_ADMIN_EMAIL` no está definido, no hace nada.
- Si el usuario existe → actualiza `role = 'super_admin'`.
- Si no existe → lo crea con ese email + `role = 'super_admin'`. El usuario debe loguearse después con Google (esa cuenta de Google debe ser dueña del mismo email).

> **Riesgo**: si la variable se pierde o se cambia, el usuario "bootstrapped" anterior **mantiene** su rol (no se le revoca) pero el nuevo email también es promovido. Si la variable queda vacía y nadie es super_admin, no hay forma desde la UI de recuperarlo — habría que ejecutar `UPDATE users SET role = 'super_admin' WHERE id = ...` directamente en la BD.

## JWT lifecycle

- **Issue** en `loginWithGoogle` (o `/api/auth/refresh`).
- **Verify** en cada request autenticado.
- **Expira** en 7 días por defecto. El frontend no implementa refresh proactivo — el usuario re-loguea.
- **No hay revocación**. Si un token cae en malas manos, sigue válido hasta expirar. `POST /api/auth/logout` solo limpia el localStorage del cliente, no invalida el token en el servidor.

> Solución pendiente: tabla `jwt_revocations` (jti, expires_at, revoked_at) y check en `authenticate`. Ver [`../analysis/security.md`](../analysis/security.md) y [`../pending-decisions.md`](../pending-decisions.md) D-006.

## Endpoints de auth

| Método | Ruta | Auth | Notas |
|--------|------|------|-------|
| `POST` | `/api/auth/google` | público | Recibe `{ id_token }`, devuelve `{ token, user }`. |
| `GET` | `/api/auth/me` | sí | Devuelve `{ user }` desde el JWT + DB. |
| `POST` | `/api/auth/logout` | sí | Best-effort. Solo limpia el front; backend no revoca. |
| `POST` | `/api/auth/refresh` | sí | Emite un JWT nuevo con la misma identidad. |

## Frontend — `AuthContext`

`src/contexts/AuthContext.jsx`:

- Estado: `{ user, token, loading }`.
- Al montar la app: si hay `token` en localStorage, llama `GET /api/auth/me`. Si responde 200 → setea `user`. Si 401 → limpia token.
- `login(token, user)` se llama desde `pages/Login.jsx` tras `POST /api/auth/google`.
- `logout()` limpia `localStorage` + llama `POST /api/auth/logout` + redirect a `/login`.

`ProtectedRoute` (en `components/auth/`) consulta este contexto; si no hay user válido y no está `loading`, redirige a `/login`.

`AdminRoute` además exige `role ∈ { admin, super_admin }`.

## Gaps conocidos

- **Sin rate limiting**: brute-force en `/api/auth/google` no está bloqueado (aunque Google ya lo limita en su lado).
- **Sin revocación**: imposible cerrar sesión "forzada".
- **Token en localStorage**: vulnerable a XSS. Mover a `httpOnly cookie` requiere CSRF protection y reescribir el flow. Considerar después de evaluar superficie de ataque real.
- **Sin 2FA**: heredamos lo que Google provea.

Plan de mitigación: [`../analysis/security.md`](../analysis/security.md).
