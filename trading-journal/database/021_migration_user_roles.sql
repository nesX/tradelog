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

-- Un solo super_admin a nivel de DB (partial unique index)
CREATE UNIQUE INDEX idx_one_super_admin ON users(role)
  WHERE role = 'super_admin';

-- Index para queries del admin panel
CREATE INDEX idx_users_role_active ON users(role)
  WHERE role IN ('admin', 'super_admin') AND deleted_at IS NULL;

-- Index para listados paginados que excluyen eliminados
CREATE INDEX idx_users_not_deleted ON users(created_at DESC)
  WHERE deleted_at IS NULL;

COMMIT;


update users set role = 'super_admin' where email = 'nessmash@gmail.com';