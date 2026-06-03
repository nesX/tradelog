# Sistema de Gestión de Usuarios — Documento de Implementación

> Trading Journal · Roles + Whitelist + Soft Delete

---

## 1. Resumen de decisiones tomadas

| Decisión | Elección |
|---|---|
| Modelo de roles | Campo `role VARCHAR` con CHECK: `user`, `admin`, `super_admin` |
| Whitelist de acceso | Solo emails pre-creados en DB pueden hacer login con Google |
| Eliminación de usuarios | Soft delete (`deleted_at`) — los datos se preservan |
| Cantidad de super_admins | Solo uno (forzado a nivel de DB) |
| Email después de creado | Inmutable |
| Estado intermedio (suspendido) | No por ahora — solo activo o eliminado |
| Refresh tokens | Diferido a otra iteración (JWT con expiry largo) |
| Auditoría | Diferido a otra iteración |

### Quién puede hacer qué

| Acción | user | admin | super_admin |
|---|:---:|:---:|:---:|
| Listar usuarios | ❌ | ✅ | ✅ |
| Crear usuario `user` | ❌ | ✅ | ✅ |
| Crear/promover a `admin` | ❌ | ❌ | ✅ |
| Eliminar usuario `user` | ❌ | ✅ | ✅ |
| Eliminar usuario `admin` | ❌ | ❌ | ✅ |
| Eliminar `super_admin` | ❌ | ❌ | ❌ (bloqueado) |

---

## 2. Migración de base de datos

**Archivo:** `database/migration_user_roles.sql`

```sql
-- ============================================================
-- Migration: Sistema de roles y soft delete para usuarios
-- ============================================================

BEGIN;

-- Agregar columnas nuevas
ALTER TABLE users
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin', 'super_admin')),
  ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN deleted_at TIMESTAMP;

-- Garantizar UN SOLO super_admin a nivel de DB.
-- Postgres permite múltiples NULLs en partial unique index, pero solo
-- una fila puede tener role = 'super_admin'.
CREATE UNIQUE INDEX idx_one_super_admin ON users(role)
  WHERE role = 'super_admin';

-- Index para queries de admin panel: listar admins activos.
-- Solo indexa filas relevantes (la mayoría son 'user', no las queremos en este index).
CREATE INDEX idx_users_role_active ON users(role)
  WHERE role IN ('admin', 'super_admin') AND deleted_at IS NULL;

-- Index para queries de login y listados (excluye eliminados).
-- El index existente idx_users_email cubre el lookup por email; este es
-- complementario para listados paginados que filtran eliminados.
CREATE INDEX idx_users_not_deleted ON users(created_at DESC)
  WHERE deleted_at IS NULL;

COMMIT;
```

**Notas sobre los índices** (importante para tu requisito de performance):

- `idx_one_super_admin` es **partial unique** — solo indexa la fila con `role='super_admin'`. Tamaño: 1 entrada. Cumple doble función: constraint + index.
- `idx_users_role_active` es **partial** — solo indexa admins. La mayoría de filas son `user`, así que no inflan el índice.
- `idx_users_not_deleted` es **partial** — solo indexa filas no eliminadas. Útil para paginación por fecha en el panel de admin.

Esto evita índices grandes innecesarios y mantiene el footprint mínimo.

---

## 3. Actualizar `database/schema.sql`

Para que un setup limpio desde cero refleje el estado final, actualizá la definición de `users` en `schema.sql`:

```sql
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    role          VARCHAR(20) NOT NULL DEFAULT 'user'
                  CHECK (role IN ('user', 'admin', 'super_admin')),
    created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deleted_at    TIMESTAMP,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Y agregar los índices a `database/indexes.sql`.

---

## 4. Variables de entorno

**Backend `.env`:** agregar una variable nueva.

```bash
# Email del super administrador. Se crea/actualiza al arrancar el server.
# Solo puede haber UNO. Cambiar este valor degrada al actual y promueve al nuevo.
SUPER_ADMIN_EMAIL=tu-email@gmail.com
```

**`.env.example`** debe incluir esta variable también, pero con un placeholder.

---

## 5. Backend

Sigo tu patrón de capas: `routes → middleware → controllers → services → repositories`.

### 5.1 Repository — `src/repositories/user.repository.js`

Agregar estos métodos (o crearlos si no existen). El que tenés actualmente probablemente solo tiene `findByEmail` y `create`.

```js
import { pool } from '../config/database.js';

/**
 * Busca un usuario activo por email (no eliminado).
 * Usado en login para validar whitelist.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export async function findActiveByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, role, created_at, last_login_at
     FROM users
     WHERE email = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

/**
 * Busca un usuario por ID (incluso eliminado, para casos admin).
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, role, created_by, deleted_at, created_at,
            updated_at, last_login_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Lista usuarios con paginación. Solo activos por defecto.
 * @param {Object} params
 * @param {number} params.page
 * @param {number} params.limit
 * @param {string} [params.role] - filtro opcional por rol
 * @param {boolean} [params.includeDeleted=false]
 * @returns {Promise<{users: Array, total: number}>}
 */
export async function findAll({ page = 1, limit = 20, role, includeDeleted = false }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const values = [];
  let idx = 1;

  if (!includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }
  if (role) {
    conditions.push(`role = $${idx++}`);
    values.push(role);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Una sola query con COUNT(*) OVER() evita un round-trip adicional.
  const sql = `
    SELECT id, email, role, created_by, deleted_at,
           created_at, last_login_at,
           COUNT(*) OVER() AS total_count
    FROM users
    ${where}
    ORDER BY created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `;
  values.push(limit, offset);

  const { rows } = await pool.query(sql, values);
  const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;

  // Quitar total_count de cada fila antes de retornar
  const users = rows.map(({ total_count, ...rest }) => rest);

  return { users, total };
}

/**
 * Crea un usuario nuevo.
 * @param {Object} data
 * @param {string} data.email
 * @param {string} data.role - 'user', 'admin' o 'super_admin'
 * @param {number} [data.createdBy] - ID del admin que lo crea
 * @returns {Promise<Object>}
 */
export async function create({ email, role = 'user', createdBy = null }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, role, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, email, role, created_by, created_at`,
    [email, role, createdBy]
  );
  return rows[0];
}

/**
 * Actualiza el rol de un usuario.
 * @param {number} id
 * @param {string} role
 * @returns {Promise<Object>}
 */
export async function updateRole(id, role) {
  const { rows } = await pool.query(
    `UPDATE users
     SET role = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, email, role, updated_at`,
    [role, id]
  );
  return rows[0] || null;
}

/**
 * Soft delete: marca como eliminado sin borrar la fila.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function softDelete(id) {
  const { rowCount } = await pool.query(
    `UPDATE users
     SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return rowCount > 0;
}

/**
 * Actualiza last_login_at. Usar solo después de validar el id_token de Google.
 * @param {number} id
 */
export async function touchLastLogin(id) {
  await pool.query(
    `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id]
  );
}

/**
 * Para el bootstrap del super_admin: encuentra el super_admin actual (si existe).
 * @returns {Promise<Object|null>}
 */
export async function findCurrentSuperAdmin() {
  const { rows } = await pool.query(
    `SELECT id, email, role FROM users
     WHERE role = 'super_admin' AND deleted_at IS NULL
     LIMIT 1`
  );
  return rows[0] || null;
}
```

### 5.2 Middleware — `src/middleware/authorize.js` (nuevo)

```js
import { AppError } from './errorHandler.js';

/**
 * Middleware factory que valida que el usuario tenga uno de los roles permitidos.
 * Se usa DESPUÉS del middleware `authenticate`, que ya pone req.user con { id, email, role }.
 *
 * Uso:
 *   router.get('/users', authenticate, authorize('admin', 'super_admin'), handler);
 *
 * @param {...string} allowedRoles
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('No autenticado', 401, 'UNAUTHENTICATED'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('No tienes permiso para esta acción', 403, 'FORBIDDEN'));
    }
    next();
  };
}
```

### 5.3 Validator — `src/validators/admin.validator.js` (nuevo)

```js
import Joi from 'joi';

export const createUserSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required().messages({
    'string.email': 'Email inválido',
    'any.required': 'El email es obligatorio',
  }),
  role: Joi.string().valid('user', 'admin').default('user').messages({
    'any.only': 'El rol debe ser "user" o "admin"',
  }),
});

export const updateUserRoleSchema = Joi.object({
  role: Joi.string().valid('user', 'admin').required().messages({
    'any.only': 'El rol debe ser "user" o "admin"',
    'any.required': 'El rol es obligatorio',
  }),
});

export const listUsersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  role: Joi.string().valid('user', 'admin', 'super_admin').optional(),
  includeDeleted: Joi.boolean().default(false),
});
```

> Nota: `super_admin` **no** está en los valores aceptados de creación o cambio de rol. Solo el bootstrap por env var puede crear un super_admin.

### 5.4 Service — `src/services/admin.service.js` (nuevo)

Aquí va toda la lógica de validación de roles. Esta es la capa que protege contra escalamiento de privilegios.

```js
import * as userRepo from '../repositories/user.repository.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Lista usuarios con paginación.
 */
export async function listUsers(query) {
  const { users, total } = await userRepo.findAll(query);
  return {
    users,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * Obtiene un usuario por ID.
 */
export async function getUserById(id) {
  const user = await userRepo.findById(id);
  if (!user) throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  return user;
}

/**
 * Crea un usuario. Solo super_admin puede crear admins.
 *
 * @param {Object} data - { email, role }
 * @param {Object} actor - usuario que ejecuta la acción (req.user)
 */
export async function createUser(data, actor) {
  const { email, role } = data;

  // Solo super_admin puede crear otro admin
  if (role === 'admin' && actor.role !== 'super_admin') {
    throw new AppError(
      'Solo el super administrador puede crear administradores',
      403,
      'FORBIDDEN'
    );
  }

  // Verificar que el email no exista ya (incluso eliminado, porque la UNIQUE
  // constraint a nivel de DB lo bloquearía igual). Si quieres permitir reusar
  // emails de usuarios soft-deleted, este check debería filtrar deleted_at IS NULL.
  // Por simplicidad y consistencia: NO permitimos reusar emails.
  const existing = await userRepo.findActiveByEmail(email);
  if (existing) {
    throw new AppError(
      'Ya existe un usuario con ese email',
      409,
      'EMAIL_ALREADY_EXISTS'
    );
  }

  return userRepo.create({ email, role, createdBy: actor.id });
}

/**
 * Actualiza el rol de un usuario.
 * Reglas:
 *   - Solo super_admin puede promover/degradar.
 *   - No se puede cambiar el rol de un super_admin.
 */
export async function updateUserRole(id, newRole, actor) {
  if (actor.role !== 'super_admin') {
    throw new AppError(
      'Solo el super administrador puede cambiar roles',
      403,
      'FORBIDDEN'
    );
  }

  const target = await userRepo.findById(id);
  if (!target || target.deleted_at) {
    throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  }

  if (target.role === 'super_admin') {
    throw new AppError(
      'No se puede modificar el rol del super administrador',
      403,
      'CANNOT_MODIFY_SUPER_ADMIN'
    );
  }

  if (target.role === newRole) {
    return target; // no-op
  }

  return userRepo.updateRole(id, newRole);
}

/**
 * Elimina (soft) un usuario.
 * Reglas:
 *   - super_admin nunca puede ser eliminado.
 *   - admin solo puede ser eliminado por super_admin.
 *   - admin puede eliminar usuarios normales.
 *   - Nadie puede eliminarse a sí mismo (evita bloqueos accidentales).
 */
export async function deleteUser(id, actor) {
  if (id === actor.id) {
    throw new AppError(
      'No puedes eliminarte a ti mismo',
      400,
      'CANNOT_DELETE_SELF'
    );
  }

  const target = await userRepo.findById(id);
  if (!target || target.deleted_at) {
    throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  }

  if (target.role === 'super_admin') {
    throw new AppError(
      'No se puede eliminar al super administrador',
      403,
      'CANNOT_DELETE_SUPER_ADMIN'
    );
  }

  if (target.role === 'admin' && actor.role !== 'super_admin') {
    throw new AppError(
      'Solo el super administrador puede eliminar administradores',
      403,
      'FORBIDDEN'
    );
  }

  const ok = await userRepo.softDelete(id);
  if (!ok) {
    throw new AppError('No se pudo eliminar el usuario', 500, 'DELETE_FAILED');
  }
  return { id, deleted: true };
}

/**
 * Bootstrap del super_admin al arrancar el servidor.
 * - Si no existe ningún super_admin → crea uno con SUPER_ADMIN_EMAIL.
 * - Si el email coincide con el actual super_admin → no hace nada.
 * - Si SUPER_ADMIN_EMAIL es distinto al actual → degrada al viejo a 'user'
 *   y promueve al nuevo. Esto se hace en transacción para mantener la
 *   constraint UNIQUE WHERE role='super_admin'.
 */
export async function initSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  if (!email) {
    throw new Error('SUPER_ADMIN_EMAIL no está configurado en el entorno');
  }

  const current = await userRepo.findCurrentSuperAdmin();

  if (current && current.email === email) {
    return; // ya está bien
  }

  const existingWithEmail = await userRepo.findActiveByEmail(email);

  // Importar pool aquí para la transacción manual
  const { pool } = await import('../config/database.js');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Degradar al super_admin actual (si existe y es diferente)
    if (current) {
      await client.query(
        `UPDATE users SET role = 'user', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [current.id]
      );
    }

    if (existingWithEmail) {
      // Ya existe el usuario con ese email → promoverlo
      await client.query(
        `UPDATE users SET role = 'super_admin', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [existingWithEmail.id]
      );
    } else {
      // No existe → crearlo
      await client.query(
        `INSERT INTO users (email, role) VALUES ($1, 'super_admin')`,
        [email]
      );
    }

    await client.query('COMMIT');
    console.log(`[bootstrap] super_admin configurado: ${email}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### 5.5 Controller — `src/controllers/admin.controller.js` (nuevo)

Capa delgada — solo extrae datos del request y llama al service.

```js
import * as adminService from '../services/admin.service.js';
import { sendSuccess } from '../utils/response.js';

export async function listUsers(req, res, next) {
  try {
    const result = await adminService.listUsers(req.query);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getUser(req, res, next) {
  try {
    const user = await adminService.getUserById(parseInt(req.params.id, 10));
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const user = await adminService.createUser(req.body, req.user);
    sendSuccess(res, user, 'Usuario creado correctamente', 201);
  } catch (err) {
    next(err);
  }
}

export async function updateUserRole(req, res, next) {
  try {
    const user = await adminService.updateUserRole(
      parseInt(req.params.id, 10),
      req.body.role,
      req.user
    );
    sendSuccess(res, user, 'Rol actualizado');
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    const result = await adminService.deleteUser(
      parseInt(req.params.id, 10),
      req.user
    );
    sendSuccess(res, result, 'Usuario eliminado');
  } catch (err) {
    next(err);
  }
}
```

### 5.6 Routes — `src/routes/admin.routes.js` (nuevo)

```js
import { Router } from 'express';
import * as ctrl from '../controllers/admin.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { validate, validateQuery } from '../middleware/validation.js';
import {
  createUserSchema,
  updateUserRoleSchema,
  listUsersQuerySchema,
} from '../validators/admin.validator.js';

const router = Router();

// Todas las rutas requieren autenticación + rol admin o super_admin
router.use(authenticate, authorize('admin', 'super_admin'));

router.get('/users', validateQuery(listUsersQuerySchema), ctrl.listUsers);
router.get('/users/:id', ctrl.getUser);
router.post('/users', validate(createUserSchema), ctrl.createUser);
router.patch('/users/:id/role', validate(updateUserRoleSchema), ctrl.updateUserRole);
router.delete('/users/:id', ctrl.deleteUser);

export default router;
```

> ⚠️ Tu `validation.js` actual probablemente tiene `validate(schema)` para `req.body`. Si no tiene `validateQuery`, agregalo (es trivial: misma idea pero validando `req.query`).

### 5.7 Modificar `src/services/auth.service.js`

El cambio clave: en el endpoint de login con Google, después de verificar el id_token, hay que validar que el email exista en la whitelist y firmar el JWT incluyendo el `role`.

Pseudocódigo del cambio (adaptá a tu implementación actual):

```js
// Dentro de la función que maneja Google OAuth (algo como loginWithGoogle):

const googlePayload = await verifyGoogleToken(idToken);
const email = googlePayload.email.toLowerCase().trim();

// CAMBIO: validar whitelist
const user = await userRepo.findActiveByEmail(email);
if (!user) {
  throw new AppError(
    'Tu email no está autorizado. Contacta al administrador.',
    403,
    'NOT_AUTHORIZED'
  );
}

// CAMBIO: incluir role en el JWT
const token = jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
);

// Actualizar last_login fire-and-forget (no bloquea la respuesta)
userRepo.touchLastLogin(user.id).catch(err =>
  console.error('Error actualizando last_login:', err)
);

return { token, user: { id: user.id, email: user.email, role: user.role } };
```

> El `userRepo.touchLastLogin` se ejecuta sin `await` para no agregar latencia al login. Si falla, solo se logea — no afecta al usuario.

### 5.8 Modificar `src/middleware/auth.js`

Asegurate de que el middleware `authenticate` ponga `role` en `req.user`:

```js
// Dentro del verify del JWT:
req.user = {
  id: decoded.id,
  email: decoded.email,
  role: decoded.role, // ← este es el campo nuevo
};
```

### 5.9 Modificar `src/server.js`

Dos cambios:

```js
import adminRoutes from './routes/admin.routes.js';
import { initSuperAdmin } from './services/admin.service.js';

// ... después de definir las otras rutas:
app.use('/api/admin', adminRoutes);

// ... en el bloque que arranca el server:
async function start() {
  try {
    await initSuperAdmin(); // bootstrap antes de escuchar
    app.listen(PORT, () => {
      console.log(`Server escuchando en :${PORT}`);
    });
  } catch (err) {
    console.error('Error en el arranque:', err);
    process.exit(1);
  }
}

start();
```

---

## 6. Frontend

### 6.1 `src/api/endpoints.js` — agregar

```js
// Admin / gestión de usuarios
export const adminEndpoints = {
  list: (params) => api.get('/admin/users', { params }),
  get: (id) => api.get(`/admin/users/${id}`),
  create: (data) => api.post('/admin/users', data),
  updateRole: (id, role) => api.patch(`/admin/users/${id}/role`, { role }),
  remove: (id) => api.delete(`/admin/users/${id}`),
};
```

### 6.2 `src/contexts/AuthContext.jsx` — exponer `role`

Asegurate de que el context exponga `user.role` (decodificándolo del token o tomándolo de la respuesta de login). Componentes posteriores van a leer `useAuth().user.role`.

### 6.3 `src/components/auth/AdminRoute.jsx` (nuevo)

Wrapper de ruta que solo deja pasar admins.

```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null; // o un spinner

  if (!user) return <Navigate to="/login" replace />;

  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  return children;
}
```

### 6.4 `src/hooks/useUsers.js` (nuevo)

Hooks de React Query siguiendo tu patrón con `tradeKeys`.

```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminEndpoints } from '../api/endpoints';
import { useToast } from '../components/common/Toast';

export const userKeys = {
  all: ['users'],
  lists: () => [...userKeys.all, 'list'],
  list: (params) => [...userKeys.lists(), params],
  detail: (id) => [...userKeys.all, 'detail', id],
};

export function useUsers(params = { page: 1, limit: 20 }) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => adminEndpoints.list(params),
    keepPreviousData: true, // mejor UX al paginar
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: adminEndpoints.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success('Usuario creado');
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error?.message || 'Error al crear');
    },
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, role }) => adminEndpoints.updateRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success('Rol actualizado');
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error?.message || 'Error al actualizar');
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: adminEndpoints.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success('Usuario eliminado');
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error?.message || 'Error al eliminar');
    },
  });
}
```

### 6.5 Página — `src/pages/admin/Users.jsx` (nuevo)

```jsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useUsers } from '../../hooks/useUsers';
import UsersTable from '../../components/admin/UsersTable';
import CreateUserModal from '../../components/admin/CreateUserModal';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';

export default function Users() {
  const { user: actor } = useAuth();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError } = useUsers({ page, limit: 20 });

  if (isLoading) return <Loading />;
  if (isError) return <p className="text-red-500">Error al cargar usuarios</p>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Gestión de usuarios</h1>
        <Button onClick={() => setCreateOpen(true)} icon={Plus}>
          Agregar usuario
        </Button>
      </div>

      <UsersTable
        users={data.users}
        actor={actor}
        pagination={data.pagination}
        onPageChange={setPage}
      />

      {createOpen && (
        <CreateUserModal
          actor={actor}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}
```

### 6.6 `src/components/admin/UsersTable.jsx` (nuevo)

```jsx
import { useState } from 'react';
import { Trash2, Shield, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useDeleteUser, useUpdateUserRole } from '../../hooks/useUsers';
import { formatDateTime } from '../../utils/formatters';

const roleConfig = {
  super_admin: { label: 'Super Admin', icon: ShieldCheck, className: 'text-purple-600' },
  admin: { label: 'Administrador', icon: Shield, className: 'text-blue-600' },
  user: { label: 'Usuario', icon: UserIcon, className: 'text-gray-600' },
};

export default function UsersTable({ users, actor, pagination, onPageChange }) {
  const deleteMut = useDeleteUser();
  const roleMut = useUpdateUserRole();

  const isSuperAdmin = actor.role === 'super_admin';

  const handleDelete = (u) => {
    if (!window.confirm(`¿Eliminar a ${u.email}? Esta acción se puede revertir desde la base de datos.`)) {
      return;
    }
    deleteMut.mutate(u.id);
  };

  const handleToggleAdmin = (u) => {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`¿Cambiar rol de ${u.email} a "${newRole}"?`)) return;
    roleMut.mutate({ id: u.id, role: newRole });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th className="text-left p-3">Email</th>
            <th className="text-left p-3">Rol</th>
            <th className="text-left p-3">Último login</th>
            <th className="text-left p-3">Creado</th>
            <th className="text-right p-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const cfg = roleConfig[u.role];
            const Icon = cfg.icon;
            const isProtected = u.role === 'super_admin';
            const isSelf = u.id === actor.id;

            return (
              <tr key={u.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  <span className={`flex items-center gap-1 ${cfg.className}`}>
                    <Icon size={16} />
                    {cfg.label}
                  </span>
                </td>
                <td className="p-3">{u.last_login_at ? formatDateTime(u.last_login_at) : '—'}</td>
                <td className="p-3">{formatDateTime(u.created_at)}</td>
                <td className="p-3 text-right space-x-2">
                  {/* Toggle admin/user — solo super_admin, y nunca sobre el super_admin */}
                  {isSuperAdmin && !isProtected && !isSelf && (
                    <button
                      onClick={() => handleToggleAdmin(u)}
                      className="text-blue-600 hover:underline"
                      disabled={roleMut.isPending}
                    >
                      {u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                    </button>
                  )}
                  {/* Eliminar — bloqueado para super_admin y para uno mismo */}
                  {!isProtected && !isSelf && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="text-red-600 hover:text-red-700"
                      disabled={deleteMut.isPending}
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Paginación simple */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t">
          <span className="text-xs text-gray-500">
            Página {pagination.page} de {pagination.totalPages} · {pagination.total} usuarios
          </span>
          <div className="space-x-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 6.7 `src/components/admin/CreateUserModal.jsx` (nuevo)

```jsx
import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import Select from '../common/Select';
import { useCreateUser } from '../../hooks/useUsers';

export default function CreateUserModal({ actor, onClose }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const createMut = useCreateUser();

  const isSuperAdmin = actor.role === 'super_admin';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    createMut.mutate(
      { email: email.trim().toLowerCase(), role },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal title="Agregar usuario" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ejemplo@gmail.com"
          required
          autoFocus
        />

        <Select
          label="Rol"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="user">Usuario</option>
          {isSuperAdmin && <option value="admin">Administrador</option>}
        </Select>

        <p className="text-xs text-gray-500">
          El usuario podrá acceder iniciando sesión con su cuenta de Google de este email.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={createMut.isPending}>
            Crear
          </Button>
        </div>
      </form>
    </Modal>
  );
}
```

### 6.8 Registrar la ruta en `App.jsx`

```jsx
import AdminRoute from './components/auth/AdminRoute';
import Users from './pages/admin/Users';

// dentro de tus <Routes>:
<Route
  path="/admin/users"
  element={
    <AdminRoute>
      <Layout><Users /></Layout>
    </AdminRoute>
  }
/>
```

### 6.9 Mostrar entrada de menú solo para admins

En `Header.jsx` o `UserMenu.jsx`, condicionar:

```jsx
const { user } = useAuth();
const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

{isAdmin && (
  <Link to="/admin/users">Gestión de usuarios</Link>
)}
```

---

## 7. Orden recomendado de implementación

Recomiendo este orden para que en cada paso el sistema quede en estado funcional:

1. **DB**: ejecutar `migration_user_roles.sql`. Verificar con `\d+ users` que las columnas existan.
2. **Env**: agregar `SUPER_ADMIN_EMAIL` con tu email de Google.
3. **Repository**: extender `user.repository.js` con los métodos nuevos.
4. **Bootstrap**: implementar `initSuperAdmin` y llamarlo desde `server.js`. Reiniciar el server y verificar que tu usuario quede como `super_admin` en DB.
5. **JWT**: modificar `auth.service.js` y `auth.middleware.js` para incluir `role`. Hacer logout/login y verificar que el token nuevo tenga el role.
6. **Whitelist**: agregar la validación de whitelist en login. Probar con un email no autorizado → debe rechazar con 403.
7. **Authorize middleware**: crear `authorize.js`.
8. **Backend admin**: validator → service → controller → routes. Probar con curl/Postman.
9. **Frontend hooks + endpoints**: `useUsers.js`, `endpoints.js`.
10. **Frontend UI**: `AdminRoute`, página `Users`, tabla, modal de crear.
11. **Menú**: agregar el link condicional en `Header`.

---

## 8. Casos de prueba manual mínimos

Después de implementar, probá estos casos para asegurar que las reglas se cumplen:

| # | Acción | Actor | Resultado esperado |
|---|---|---|---|
| 1 | Login con email no whitelisteado | — | 403 NOT_AUTHORIZED |
| 2 | Login con email whitelisteado | — | 200 + JWT con role |
| 3 | GET `/api/admin/users` | user | 403 FORBIDDEN |
| 4 | GET `/api/admin/users` | admin | 200 lista |
| 5 | POST crear con role=admin | admin | 403 FORBIDDEN |
| 6 | POST crear con role=admin | super_admin | 201 creado |
| 7 | DELETE super_admin (id correcto) | super_admin | 403 CANNOT_DELETE_SUPER_ADMIN |
| 8 | DELETE admin | admin | 403 FORBIDDEN |
| 9 | DELETE admin | super_admin | 200 eliminado |
| 10 | DELETE a sí mismo | super_admin | 400 CANNOT_DELETE_SELF |
| 11 | PATCH role super_admin → user | super_admin | 403 CANNOT_MODIFY_SUPER_ADMIN |
| 12 | Crear con email duplicado | admin | 409 EMAIL_ALREADY_EXISTS |
| 13 | Crear segundo super_admin vía SQL directo | — | violación UNIQUE constraint |

---

## 9. Notas finales

**Performance**: el design usa partial indexes para mantener footprint mínimo, una sola query para listar+contar (`COUNT(*) OVER()`), y JWT con role para evitar lookup en cada request. Esto está alineado con tu requisito de minimizar consumo de recursos.

**Seguridad por capas (defense in depth)**:
- DB: CHECK constraint + UNIQUE partial index para super_admin.
- Service: validaciones explícitas de rol del actor antes de cada operación.
- Middleware: bloqueo grueso por rol antes de tocar el service.
- Frontend: oculta UI según rol (pero el backend nunca confía en eso).

**Cosas que quedan diferidas**:
- Refresh tokens (cambios de rol toman hasta `JWT_EXPIRES_IN` en propagarse).
- Tabla de auditoría (`user_audit_log`).
- UI para ver usuarios eliminados / restaurar.
- Paginación con búsqueda por email.

Cualquiera de esas se puede agregar incrementalmente sin tocar el diseño base.



Lo que se implementó
Base de datos
database/021_migration_user_roles.sql — Agrega role, created_by, deleted_at a users, con partial unique index para garantizar un solo super_admin.
Backend
user.model.js — Agrega role, created_by, deleted_at a USER_FIELDS.
user.repository.js — Agrega findActiveByEmail, findAll, createUser, updateRole, softDelete, touchLastLogin, findCurrentSuperAdmin, promoteToSuperAdmin (con transacción).
authorize.js — Middleware factory authorize(...roles).
admin.validator.js — Schemas para crear usuario, cambiar rol y listar usuarios.
validation.js — Agrega validateQuery (alias de validate(schema, 'query')).
admin.service.js — Lógica de negocio con todas las reglas de roles + initSuperAdmin.
admin.controller.js + admin.routes.js — Rutas GET/POST /api/admin/users, GET/PATCH/DELETE /api/admin/users/:id.
auth.service.js — Login usa findActiveByEmail (whitelist), JWT incluye role, getCurrentUser retorna role.
auth.js — req.user incluye role: payload.role || 'user'.
server.js — Registra /api/admin y llama initSuperAdmin() al arrancar.
.env.example — Agrega SUPER_ADMIN_EMAIL.
Frontend
endpoints.js — Endpoints listUsers, createAdminUser, updateAdminUserRole, deleteAdminUser.
AuthContext.jsx — Corrige setUser(response.data?.user) en el reload (fix de bug existente), expone role.
AdminRoute.jsx — Guard que redirige a / si no es admin.
useUsers.js — Hooks useUsers, useCreateUser, useUpdateUserRole, useDeleteUser.
pages/admin/Users.jsx + UsersTable.jsx + CreateUserModal.jsx — UI completa del panel.
App.jsx — Ruta /admin/users envuelta en AdminRoute.
Header.jsx — Link "Usuarios" visible solo para admins.
Próximo paso
Agregar SUPER_ADMIN_EMAIL=nessmash@gmail.com al .env del backend y reiniciar el servidor. Al arrancar, tu usuario quedará promovido a super_admin en la DB.