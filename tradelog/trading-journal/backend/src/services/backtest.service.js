import * as repo from '../repositories/backtest.repository.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

// ==================
// SESIONES
// ==================

/**
 * Lista todas las sesiones del usuario
 */
export const getSessions = async (userId) => {
  const sessions = await repo.findAllByUser(userId);
  return sessions.map(formatSession);
};

/**
 * Obtiene una sesión con sus trades
 */
export const getSession = async (userId, sessionId) => {
  const session = await repo.findById(sessionId, userId);
  if (!session) {
    throw new NotFoundError('Sesión no encontrada');
  }
  return formatSessionWithTrades(session);
};

/**
 * Crea una sesión nueva
 */
export const createSession = async (userId, data) => {
  if (data.parent_session_id) {
    const parent = await repo.findByIdRaw(data.parent_session_id, userId);
    if (!parent) {
      throw new ValidationError('La sesión padre no existe o no te pertenece', [
        { field: 'parent_session_id', message: 'Sesión padre no válida' },
      ]);
    }
    if (!parent.closed_at) {
      throw new ValidationError('Debes cerrar la sesión anterior antes de crear una continuación', [
        { field: 'parent_session_id', message: 'La sesión padre debe estar cerrada' },
      ]);
    }
  }

  const session = await repo.create({ ...data, user_id: userId });
  return session;
};

/**
 * Cierra una sesión
 */
export const closeSession = async (userId, sessionId, data) => {
  const session = await repo.findByIdRaw(sessionId, userId);
  if (!session) {
    throw new NotFoundError('Sesión no encontrada');
  }
  if (session.closed_at) {
    throw new ValidationError('La sesión ya está cerrada', [
      { field: 'closed_at', message: 'La sesión ya estaba cerrada' },
    ]);
  }

  const updated = await repo.closeSession(sessionId, userId, data);
  return updated;
};

/**
 * Obtiene datos de una sesión para precargar en formulario de continuación
 */
export const getSessionForContinuation = async (userId, sessionId) => {
  const session = await repo.findByIdRaw(sessionId, userId);
  if (!session) {
    throw new NotFoundError('Sesión no encontrada');
  }
  return {
    id: session.id,
    symbol: session.symbol,
    timeframe: session.timeframe,
    period_date: session.period_date,
    period_end_date: session.period_end_date,
  };
};

// ==================
// TRADES
// ==================

/**
 * Agrega un trade a una sesión activa
 */
export const addTrade = async (userId, sessionId, data) => {
  const session = await repo.findByIdRaw(sessionId, userId);
  if (!session) {
    throw new NotFoundError('Sesión no encontrada');
  }
  if (session.closed_at) {
    throw new ValidationError('No puedes agregar trades a una sesión cerrada', [
      { field: 'session_id', message: 'La sesión está cerrada' },
    ]);
  }

  const trade = await repo.addTrade(sessionId, data);
  return trade;
};

/**
 * Elimina un trade de una sesión activa
 */
export const deleteTrade = async (userId, tradeId) => {
  const trade = await repo.findTradeWithSession(tradeId, userId);
  if (!trade) {
    throw new NotFoundError('Trade no encontrado');
  }
  if (trade.session_closed_at) {
    throw new ValidationError('No puedes eliminar trades de una sesión cerrada', [
      { field: 'trade_id', message: 'La sesión está cerrada' },
    ]);
  }

  await repo.deleteTrade(tradeId, trade.session_id);
};

// ==================
// Helpers de formato
// ==================

const formatSession = (row) => ({
  id: row.id,
  symbol: row.symbol,
  timeframe: row.timeframe,
  period_date: row.period_date,
  period_end_date: row.period_end_date || null,
  mood_start_score: row.mood_start_score,
  mood_start_comment: row.mood_start_comment,
  mood_end_score: row.mood_end_score,
  mood_end_comment: row.mood_end_comment,
  closing_comment: row.closing_comment,
  closed_at: row.closed_at,
  parent_session_id: row.parent_session_id,
  parent_symbol: row.parent_symbol || null,
  parent_period_date: row.parent_period_date || null,
  is_continuation: !!row.parent_session_id,
  total_trades: parseInt(row.total_trades, 10) || 0,
  long_wins: parseInt(row.long_wins, 10) || 0,
  long_losses: parseInt(row.long_losses, 10) || 0,
  short_wins: parseInt(row.short_wins, 10) || 0,
  short_losses: parseInt(row.short_losses, 10) || 0,
  break_evens: parseInt(row.break_evens, 10) || 0,
  win_rate: row.win_rate ? parseFloat(row.win_rate) : null,
  created_at: row.created_at,
});

const formatSessionWithTrades = (row) => ({
  ...formatSession(row),
  trades: (row.trades || []).map((t) => ({
    id: t.id,
    result: t.result,
    comment: t.comment,
    created_at: t.created_at,
  })),
});
