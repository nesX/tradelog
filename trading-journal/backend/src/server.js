import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config/env.js';
import { testConnection } from './config/database.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { ensureDirectoryExists } from './utils/fileUtils.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import tradeRoutes from './routes/trade.routes.js';
import statsRoutes from './routes/stats.routes.js';
import systemRoutes from './routes/system.routes.js';
import backtestRoutes from './routes/backtest.routes.js';
import noteRoutes from './routes/note.routes.js';
import adminRoutes from './routes/admin.routes.js';
import todoRoutes from './routes/todo.routes.js';
import marketSymbolRoutes from './routes/marketSymbol.routes.js';
import priceAlertRoutes from './routes/priceAlert.routes.js';
import dateReminderRoutes from './routes/dateReminder.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import { initSuperAdmin } from './services/admin.service.js';
import { purgeDeletedNotes } from './services/note.service.js';
import { runTick, computeFirstDelay, getJobState } from './services/reminderJob.service.js';
import { setBackoffUntil as setBinanceBackoffUntil } from './clients/binanceFutures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ======================
// Middlewares globales
// ======================

// Seguridad con Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
app.use(cors({
  origin: config.cors.origins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parseo de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ======================
// Servir archivos estáticos (imágenes)
// ======================
const uploadsPath = path.resolve(config.upload.dir);
app.use('/api/images', express.static(uploadsPath));

// ======================
// Rutas de la API
// ======================
app.use('/api/auth', authRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api', systemRoutes);
app.use('/api/backtest', backtestRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/market-symbols', marketSymbolRoutes);
app.use('/api/price-alerts', priceAlertRoutes);
app.use('/api/date-reminders', dateReminderRoutes);
app.use('/api/notifications', notificationRoutes);

// Ruta de health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.env,
    },
  });
});

// ======================
// Manejo de errores
// ======================

// Ruta no encontrada
app.use(notFoundHandler);

// Error handler centralizado
app.use(errorHandler);

// ======================
// Job de purga diferida de notas soft-deleted (+ sus imágenes en disco)
// ======================
const startNotePurgeJob = () => {
  const hours = config.notePurge.intervalHours;
  if (!hours || hours <= 0) {
    logger.info('Purga de notas desactivada (NOTE_PURGE_INTERVAL_HOURS=0)');
    return;
  }
  const run = async () => {
    try {
      const { purgedNotes, deletedFiles } = await purgeDeletedNotes();
      if (purgedNotes > 0) {
        logger.info(`Purga de notas: ${purgedNotes} notas y ${deletedFiles} archivos eliminados`);
      }
    } catch (err) {
      logger.error('Error en la purga de notas', err);
    }
  };
  run(); // pasada inicial al arrancar
  setInterval(run, hours * 60 * 60 * 1000);
};

// ======================
// Job de recordatorios de análisis (alertas de precio y por fecha)
// ======================
// Cadena de setTimeout (no setInterval): el primer tick se programa desde
// last_run_at, así un deploy no adelanta peticiones a Binance ni una racha de
// deploys deja al job sin correr. Cada tick programa el siguiente al terminar.
const startReminderJob = async () => {
  const minutes = config.reminders.tickMinutes;
  if (!minutes || minutes <= 0) {
    logger.info('Job de recordatorios desactivado (REMINDERS_TICK_MINUTES=0)');
    return;
  }
  const intervalMs = minutes * 60 * 1000;

  let state;
  try {
    state = await getJobState();
  } catch (err) {
    logger.error('Job de recordatorios no iniciado: no se pudo leer reminder_job_state (¿falta la migración 028?)', err);
    return;
  }
  if (state?.backoff_until) setBinanceBackoffUntil(state.backoff_until);

  const schedule = (delayMs) => {
    setTimeout(async () => {
      try {
        await runTick();
      } catch (err) {
        logger.error('Error en el job de recordatorios', err);
      } finally {
        schedule(intervalMs);
      }
    }, delayMs);
  };

  const firstDelay = computeFirstDelay(state?.last_run_at, intervalMs);
  logger.info(`Job de recordatorios: cada ${minutes} min, primer tick en ${Math.round(firstDelay / 1000)} s`);
  schedule(firstDelay);
};

// ======================
// Iniciar servidor
// ======================
const startServer = async () => {
  try {
    // Verificar conexión a la base de datos
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('No se pudo conectar a la base de datos');
    }

    // Crear directorio de uploads si no existe
    await ensureDirectoryExists(uploadsPath);

    // Bootstrap del super_admin
    await initSuperAdmin();

    // Job de purga diferida de notas soft-deleted
    startNotePurgeJob();

    // Job de recordatorios de análisis
    await startReminderJob();

    // Iniciar servidor
    app.listen(config.port, () => {
      logger.info(`Servidor iniciado en puerto ${config.port}`);
      logger.info(`Ambiente: ${config.env}`);
      logger.info(`API disponible en: http://localhost:${config.port}/api`);
    });
  } catch (error) {
    logger.error('Error al iniciar el servidor', error);
    process.exit(1);
  }
};

// Manejar señales de terminación
process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido, cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT recibido, cerrando servidor...');
  process.exit(0);
});

// Manejar errores no capturados
process.on('unhandledRejection', (reason, _promise) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();

export default app;
