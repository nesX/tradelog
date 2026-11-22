/**
 * `pg` devuelve NUMERIC como string. Los repositories los convierten con esto
 * antes de devolverlos: comparar dos strings da resultados falsos
 * ('60000' > '100000' es true).
 */
export const toNumberOrNull = (value) => (value == null ? null : Number(value));
