-- ============================================================
-- MIGRACIÓN: Sistema de Notas
-- ============================================================

-- 1. Tabla principal de notas
CREATE TABLE notes (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  parent_note_id  INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  title           VARCHAR(500) NOT NULL DEFAULT 'Sin título',
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at      TIMESTAMP DEFAULT NULL
);

-- 2. Bloques de contenido de cada nota
CREATE TABLE note_blocks (
  id              SERIAL PRIMARY KEY,
  note_id         INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  block_type      VARCHAR(20) NOT NULL CHECK (block_type IN ('text', 'image_gallery', 'note_link')),
  content         TEXT,
  linked_note_id  INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Imágenes dentro de bloques de galería
CREATE TABLE note_block_images (
  id              SERIAL PRIMARY KEY,
  block_id        INTEGER NOT NULL REFERENCES note_blocks(id) ON DELETE CASCADE,
  image_path      VARCHAR(500) NOT NULL,
  caption         VARCHAR(1000),
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tags globales del usuario
CREATE TABLE note_tags (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  name            VARCHAR(100) NOT NULL,
  color           VARCHAR(7) DEFAULT '#6B7280',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla pivot notas ↔ tags
CREATE TABLE note_tag_assignments (
  id              SERIAL PRIMARY KEY,
  note_id         INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id          INTEGER NOT NULL REFERENCES note_tags(id) ON DELETE CASCADE,
  UNIQUE(note_id, tag_id)
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_parent ON notes(parent_note_id);
CREATE INDEX idx_notes_deleted ON notes(deleted_at);
CREATE INDEX idx_note_blocks_note_id ON note_blocks(note_id);
CREATE INDEX idx_note_blocks_linked_note ON note_blocks(linked_note_id);
CREATE INDEX idx_note_block_images_block_id ON note_block_images(block_id);
CREATE INDEX idx_note_tags_user_id ON note_tags(user_id);
CREATE UNIQUE INDEX idx_note_tags_unique_name ON note_tags(user_id, LOWER(name));
CREATE INDEX idx_note_tag_assignments_note ON note_tag_assignments(note_id);
CREATE INDEX idx_note_tag_assignments_tag ON note_tag_assignments(tag_id);

-- ============================================================
-- TRIGGERS (reutiliza la función update_updated_at_column
-- que ya existe en triggers.sql)
-- ============================================================

CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_note_blocks_updated_at
  BEFORE UPDATE ON note_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
