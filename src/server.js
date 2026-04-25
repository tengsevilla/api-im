import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import logger from './utils/logger.js';
import db from './models/index.js';

// Route Imports
import accountRoutes from './routes/account.routes.js';
import clientRoutes from './routes/client.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import transactionRoutes from './routes/transactions.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';

const app = express();
const PORT = process.env.PORT || 3030;

// ==========================================
// 1. TRUST PROXY (Required for Heroku/Railway)
// ==========================================
app.set('trust proxy', 1);

// ==========================================
// 2. SECURITY HEADERS
// ==========================================
if (process.env.NODE_ENV === 'production') {
  app.use(helmet());
}

// ==========================================
// 3. LOGGING (Before CORS so OPTIONS requests appear in logs)
// ==========================================
app.use(morgan(process.env.NODE_ENV !== 'production' ? 'dev' : 'combined'));

// ==========================================
// 4. CORS (Before everything else)
// ==========================================
const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'client_id', 'clientid', 'Clientid'],
  credentials: true,
};

// Express 5 compatible preflight handler
app.options('/{*path}', cors(corsOptions));
app.use(cors(corsOptions));

// ==========================================
// 5. BODY PARSING
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 6. RATE LIMITING
// ==========================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 300 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/', limiter);

// ==========================================
// 7. ROUTES
// ==========================================

// Root
app.get('/', (_req, res) => {
  res.json({
    message: 'Inventory Management API is live.',
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// Health Check
app.get('/health', async (_req, res) => {
  const isInternal = process.env.NODE_ENV !== 'production';
  try {
    const connection = await db.getConnection();
    connection.release();
    res.json({
      status: 'healthy',
      db: 'connected',
      uptime: isInternal ? process.uptime() : undefined,
      timestamp: new Date().toISOString(),
      env: isInternal ? process.env.NODE_ENV : undefined,
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      db: 'disconnected',
      error: isInternal ? err.message : undefined,
    });
  }
});

app.use('/api/account', accountRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/analytics', analyticsRoutes);

// ==========================================
// 8. ERROR HANDLERS
// ==========================================

// 404 - No path argument needed, just place it last (Express 4 & 5 compatible)
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'Invalid API endpoint' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error(`Global Error: ${err.stack}`);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ==========================================
// 9. SERVER STARTUP & GRACEFUL SHUTDOWN
// ==========================================
const startServer = async () => {
  try {
    logger.info('⏳ Validating Database Connection...');
    const connection = await db.getConnection();
    logger.info('✅ Database Connection Verified');
    connection.release();

    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });

    const gracefulShutdown = (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await db.end();
        logger.info('✅ Process terminated.');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (err) {
    logger.error('❌ CRITICAL: Failed to start server:', err.message);
    process.exit(1);
  }
};

// ==========================================
// 10. GLOBAL CRASH HANDLERS
// ==========================================
process.on('unhandledRejection', (reason, promise) => {
  logger.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error(`🔥 Uncaught Exception: ${err.message}`);
  process.exit(1);
});

startServer();