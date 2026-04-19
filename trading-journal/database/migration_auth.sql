-- ============================================
-- Migration: Autenticación con Google OAuth
-- ============================================

-- Crear tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para búsqueda por email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

COMMENT ON TABLE users IS 'Usuarios autenticados via Google OAuth';

-- Agregar columna user_id a trades
ALTER TABLE trades ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Índice para filtrar trades por usuario
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);

COMMENT ON COLUMN trades.user_id IS 'ID del usuario propietario del trade';

-- ============================================
-- Usuarios iniciales
-- ============================================
INSERT INTO users (email) VALUES
    ('nessmash@gmail.com'),
    ('angelleonardoarevalosuarez@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- Migración de trades existentes (opcional)
-- Asigna trades sin usuario al primer usuario
-- ============================================

-- UPDATE trades
-- SET user_id = (SELECT id FROM users WHERE email = 'nessmash@gmail.com')
-- WHERE user_id IS NULL;
