import { pool } from '../config/database.js';
import { toNumberOrNull } from '../utils/numeric.js';

// Catálogo de perpetuos de Binance Futures (global: los símbolos son públicos)
// y checkpoint de vigilancia por símbolo.

const parseSymbol = (row) =>
  row && {
    ...row,
    tick_size: toNumberOrNull(row.tick_size),
    last_price: toNumberOrNull(row.last_price),
  };

/**
 * Upsert del catálogo en una sola sentencia. Un símbolo deslistado que vuelve a
 * TRADING recupera `invalid_at = NULL`. Las filas sin cambios no se tocan (no
 * dispara el trigger de updated_at en cada sync).
 * @param {Array<{ symbol, contractType, baseAsset, quoteAsset, tickSize }>} contracts
 */
export const upsertMany = async (contracts, exec = pool) => {
  if (contracts.length === 0) return 0;
  const result = await exec.query(
    `INSERT INTO market_symbols (symbol, contract_type, base_asset, quote_asset, tick_size)
     SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[], $5::numeric[])
     ON CONFLICT (symbol) DO UPDATE SET
       contract_type = EXCLUDED.contract_type,
       base_asset    = EXCLUDED.base_asset,
       quote_asset   = EXCLUDED.quote_asset,
       tick_size     = EXCLUDED.tick_size,
       invalid_at    = NULL
     WHERE market_symbols.invalid_at IS NOT NULL
        OR (market_symbols.contract_type, market_symbols.base_asset, market_symbols.quote_asset, market_symbols.tick_size)
           IS DISTINCT FROM (EXCLUDED.contract_type, EXCLUDED.base_asset, EXCLUDED.quote_asset, EXCLUDED.tick_size)`,
    [
      contracts.map((c) => c.symbol),
      contracts.map((c) => c.contractType),
      contracts.map((c) => c.baseAsset),
      contracts.map((c) => c.quoteAsset),
      contracts.map((c) => c.tickSize),
    ]
  );
  return result.rowCount;
};

/**
 * Catálogo vigente para el combobox: primero los símbolos que el usuario usó en
 * alertas (por el armado más reciente), luego el resto alfabético.
 */
export const listActive = async (userId) => {
  const result = await pool.query(
    `SELECT ms.symbol, ms.contract_type, ms.base_asset, ms.quote_asset, ms.tick_size,
            ms.last_price, ms.last_price_at, used.last_used_at
     FROM market_symbols ms
     LEFT JOIN (
       SELECT symbol, MAX(armed_at) AS last_used_at
       FROM price_alerts WHERE user_id = $1
       GROUP BY symbol
     ) used ON used.symbol = ms.symbol
     WHERE ms.invalid_at IS NULL
     ORDER BY used.last_used_at DESC NULLS LAST, ms.symbol ASC`,
    [userId]
  );
  return result.rows.map(parseSymbol);
};

export const findBySymbol = async (symbol, exec = pool) => {
  const result = await exec.query(`SELECT * FROM market_symbols WHERE symbol = $1`, [symbol]);
  return parseSymbol(result.rows[0]) || null;
};

/** Símbolos vigentes (sin invalid_at), para detectar deslistados en el sync. */
export const listActiveSymbols = async (exec = pool) => {
  const result = await exec.query(`SELECT symbol FROM market_symbols WHERE invalid_at IS NULL`);
  return result.rows.map((r) => r.symbol);
};

/** Marca como deslistados los que aún estaban vigentes; devuelve los marcados. */
export const markInvalid = async (symbols, exec = pool) => {
  const result = await exec.query(
    `UPDATE market_symbols SET invalid_at = NOW()
     WHERE symbol = ANY($1::varchar[]) AND invalid_at IS NULL
     RETURNING symbol`,
    [symbols]
  );
  return result.rows.map((r) => r.symbol);
};

/**
 * Símbolos que el job debe revisar: vigentes y con alertas activas en notas no
 * borradas.
 */
export const findWatched = async (exec = pool) => {
  const result = await exec.query(
    `SELECT ms.*
     FROM market_symbols ms
     WHERE ms.invalid_at IS NULL
       AND EXISTS (
         SELECT 1 FROM price_alerts pa
         LEFT JOIN note_blocks b ON b.id = pa.block_id
         JOIN notes n ON n.id = COALESCE(pa.note_id, b.note_id)
         WHERE pa.symbol = ms.symbol AND pa.status = 'active' AND n.deleted_at IS NULL
       )
     ORDER BY ms.symbol`
  );
  return result.rows.map(parseSymbol);
};

/** Reinicia el checkpoint (al crear la primera alerta activa de un símbolo). */
export const setCheckedUntil = async (symbol, checkedUntil, exec = pool) => {
  await exec.query(`UPDATE market_symbols SET checked_until = $2 WHERE symbol = $1`, [symbol, checkedUntil]);
};

/** Avanza el checkpoint tras evaluar las velas leídas. */
export const updateCheckpoint = async (symbol, { checkedUntil, lastPrice }, exec = pool) => {
  await exec.query(
    `UPDATE market_symbols
     SET checked_until = $2, last_price = $3, last_price_at = NOW()
     WHERE symbol = $1`,
    [symbol, checkedUntil, lastPrice]
  );
};
