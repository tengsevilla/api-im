import app from './app.js';
import logger from './utils/logger.js';
import db from './models/index.js';

const PORT = process.env.PORT || 3030;

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
