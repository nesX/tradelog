BEGIN;

-- Fix notes: reassign fractional-indexing positions using valid sequential keys.
-- The old migration used 'a' || LPAD(n, 6, '0') which produces invalid keys
-- when the fractional part (after the 2-char integer) ends in '0' (e.g. a000000, a000010).
-- Valid single-char sequence: a0..a9 (chr 48-57), aA..aZ (chr 65-90), aa..az (chr 97-122).
WITH ranked_notes AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, parent_note_id
      ORDER BY position ASC, created_at ASC
    ) - 1 AS idx
  FROM notes
)
UPDATE notes n
SET position = (
  CASE
    WHEN r.idx < 10 THEN 'a' || chr(48 + r.idx::int)
    WHEN r.idx < 36 THEN 'a' || chr(55 + r.idx::int)
    WHEN r.idx < 62 THEN 'a' || chr(61 + r.idx::int)
    ELSE 'a0'
  END
)
FROM ranked_notes r
WHERE n.id = r.id;

-- Fix note_blocks: same approach, partitioned by note.
WITH ranked_blocks AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY note_id
      ORDER BY position ASC
    ) - 1 AS idx
  FROM note_blocks
)
UPDATE note_blocks b
SET position = (
  CASE
    WHEN r.idx < 10 THEN 'a' || chr(48 + r.idx::int)
    WHEN r.idx < 36 THEN 'a' || chr(55 + r.idx::int)
    WHEN r.idx < 62 THEN 'a' || chr(61 + r.idx::int)
    ELSE 'a0'
  END
)
FROM ranked_blocks r
WHERE b.id = r.id;

COMMIT;
