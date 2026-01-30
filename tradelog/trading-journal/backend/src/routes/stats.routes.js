import { Router } from 'express';
import * as statsController from '../controllers/stats.controller.js';

const router = Router();

// GET /api/stats - Estadísticas generales
router.get('/', statsController.getGeneralStats);

// GET /api/stats/by-symbol - Estadísticas por símbolo
router.get('/by-symbol', statsController.getStatsBySymbol);

// GET /api/stats/by-date - Estadísticas por rango de fechas
router.get('/by-date', statsController.getStatsByDateRange);

// GET /api/stats/daily-pnl - P&L diario
router.get('/daily-pnl', statsController.getDailyPnL);

// GET /api/stats/by-type - Estadísticas por tipo de trade
router.get('/by-type', statsController.getStatsByType);

// GET /api/stats/top-trades - Mejores y peores trades
router.get('/top-trades', statsController.getTopTrades);

export default router;
