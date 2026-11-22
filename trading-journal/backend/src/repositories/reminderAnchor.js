/**
 * Fragmentos SQL del anclaje de una alerta de precio o un recordatorio por fecha
 * (bloque XOR nota). En las de bloque la nota se deriva por join, así que mover
 * el bloque a otra nota no desincroniza nada.
 *
 * `t` es el alias de la tabla (price_alerts / date_reminders); usa los alias
 * `ab` (bloque) y `an` (nota). Solo se interpolan alias fijos, nunca datos.
 */

export const anchorJoins = (t) => `
  LEFT JOIN note_blocks ab ON ab.id = ${t}.block_id
  JOIN notes an ON an.id = COALESCE(${t}.note_id, ab.note_id)`;

// anchor_content: el contenido del bloque o, en anclajes de nota, el del primer
// bloque de texto no vacío (para el extracto de las tarjetas).
export const anchorColumns = (t) => `
  COALESCE(${t}.note_id, ab.note_id) AS note_id,
  ${t}.block_id,
  an.title AS note_title,
  an.deleted_at AS note_deleted_at,
  CASE WHEN ${t}.block_id IS NOT NULL THEN ab.content
       ELSE (SELECT fb.content FROM note_blocks fb
             WHERE fb.note_id = an.id AND fb.block_type = 'text'
               AND COALESCE(TRIM(fb.content), '') <> ''
             ORDER BY fb.position COLLATE "C" ASC
             LIMIT 1)
  END AS anchor_content`;
