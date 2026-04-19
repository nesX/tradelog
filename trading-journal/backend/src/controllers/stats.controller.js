import * as statsService from '../services/stats.service.js';
import { sendSuccess } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * Controllers para endpoints de estadísticas
 */

/**
 * GET /api/stats - Obtener estadísticas generales
 */
export const getGeneralStats = async (req, res, next) => {
  try {
    const stats = await statsService.getGeneralStats(req.user.id);
    sendSuccess(res, stats);
  } catch (error) {
    logger.error('StatsController:getGeneralStats', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

/**
 * GET /api/stats/by-symbol - Obtener estadísticas por símbolo
 */
export const getStatsBySymbol = async (req, res, next) => {
  try {
    const stats = await statsService.getStatsBySymbol(req.user.id);
    sendSuccess(res, { symbols: stats });
  } catch (error) {
    logger.error('StatsController:getStatsBySymbol', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

/**
 * GET /api/stats/by-date - Obtener estadísticas por rango de fechas
 */
export const getStatsByDateRange = async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const from = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = dateTo ? new Date(dateTo) : new Date();
    const stats = await statsService.getStatsByDateRange(req.user.id, from, to);
    sendSuccess(res, stats);
  } catch (error) {
    logger.error('StatsController:getStatsByDateRange', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

/**
 * GET /api/stats/daily-pnl - Obtener P&L diario
 */
export const getDailyPnL = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await statsService.getDailyPnL(req.user.id, days);
    sendSuccess(res, { dailyPnL: data });
  } catch (error) {
    logger.error('StatsController:getDailyPnL', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

/**
 * GET /api/stats/by-type - Obtener estadísticas por tipo de trade
 */
export const getStatsByType = async (req, res, next) => {
  try {
    const stats = await statsService.getStatsByTradeType(req.user.id);
    sendSuccess(res, stats);
  } catch (error) {
    logger.error('StatsController:getStatsByType', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

/**
 * GET /api/stats/top-trades - Obtener mejores y peores trades
 */
export const getTopTrades = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const data = await statsService.getTopTrades(req.user.id, limit);
    sendSuccess(res, data);
  } catch (error) {
    logger.error('StatsController:getTopTrades', { error: error.message, userId: req.user?.id });
    next(error);
  }
};
