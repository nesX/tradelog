CREATE INDEX IF NOT EXISTS idx_notes_title_fts
  ON notes USING gin(to_tsvector('spanish', COALESCE(title, '')));

CREATE INDEX IF NOT EXISTS idx_note_blocks_content_fts
  ON note_blocks USING gin(to_tsvector('spanish', COALESCE(content, '')));
