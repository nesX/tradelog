import * as statsService from '../services/stats.service.js';
import { sendSuccess } from '../utils/response.js';

/**
 * Controllers para endpoints de estadísticas
 */

/**
 * GET /api/stats - Obtener estadísticas generales
 */
export const getGeneralStats = async (req, res) => {
  const stats = await statsService.getGeneralStats();

  sendSuccess(res, stats);
};

/**
 * GET /api/stats/by-symbol - Obtener estadísticas por símbolo
 */
export const getStatsBySymbol = async (req, res) => {
  const stats = await statsService.getStatsBySymbol();

  sendSuccess(res, { symbols: stats });
};

/**
 * GET /api/stats/by-date - Obtener estadísticas por rango de fechas
 */
export const getStatsByDateRange = async (req, res) => {
  const { dateFrom, dateTo } = req.query;

  // Si no se proporcionan fechas, usar últimos 30 días
  const from = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = dateTo ? new Date(dateTo) : new Date();

  const stats = await statsService.getStatsByDateRange(from, to);

  sendSuccess(res, stats);
};

/**
 * GET /api/stats/daily-pnl - Obtener P&L diario
 */
export const getDailyPnL = async (req, res) => {
  const days = parseInt(req.query.days) || 30;

  const data = await statsService.getDailyPnL(days);

  sendSuccess(res, { dailyPnL: data });
};

/**
 * GET /api/stats/by-type - Obtener estadísticas por tipo de trade
 */
export const getStatsByType = async (req, res) => {
  const stats = await statsService.getStatsByTradeType();

  sendSuccess(res, stats);
};

/**
 * GET /api/stats/top-trades - Obtener mejores y peores trades
 */
export const getTopTrades = async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;

  const data = await statsService.getTopTrades(limit);

  sendSuccess(res, data);
};
