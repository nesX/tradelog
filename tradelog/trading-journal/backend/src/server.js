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
import tradeRoutes from './routes/trade.routes.js';
import statsRoutes from './routes/stats.routes.js';

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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
app.use('/api/trades', tradeRoutes);
app.use('/api/stats', statsRoutes);

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
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();

export default app;
