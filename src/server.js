import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from './utils/logger.js';
import db from './models/index.js';

// Route Imports
import accountRoutes from './routes/account.routes.js';
import clientRoutes from './routes/client.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import transactionRoutes from './routes/transactions.routes.js';
import analyticsRoutes from './routes/analytics.routes.js'

const app = express();
const PORT = process.env.PORT || 3030;

// ==========================================
// 1. Critical for Heroku (Trust Proxy)
// ==========================================
// Heroku runs your app behind a load balancer/reverse proxy.
// Without this, req.ip will always be the internal load balancer IP.
app.set('trust proxy', 1); // ✅ Works for both Heroku and Railway

// ==========================================
// Middleware
// ==========================================

app.use(helmet());

// Update CORS to be safer in production if possible
app.use(cors({
  // Tip: In the future, replace "*" with your actual frontend URL (e.g., process.env.FRONTEND_URL)
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  // Ensure 'client_id' matches what you send from Frontend (Client-ID vs clientid)
  allowedHeaders: ["Content-Type", "Authorization", "client_id", "clientid"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Optional: Request Logger (Good for debugging production issues)
app.use((req, res, next) => {
  const isDebug = process.env.DEBUG_MODE === 'true';
  if (isDebug && req.url !== '/') {
    // Plain console log is safest and simplest
    console.log(`${req.method} ${req.url} - IP: ${req.ip}`);

    // OR if you prefer to keep using your logger file:
    // logger.info(`${req.method} ${req.url} - IP: ${req.ip}`);
  }
  next();
});
// ==========================================
// Routes
// ==========================================

app.get("/", (req, res) => {
  res.json({
    message: "Inventory Management API is live.",
    env: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

app.use('/api/account', accountRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/analytics', analyticsRoutes);

// ==========================================
// Error Handling
// ==========================================

app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  logger.error(`Global Error: ${err.stack}`);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ==========================================
// Server Start (With DB Check)
// ==========================================

const startServer = async () => {
  try {
    // 🔍 Database Connection Check
    const connection = await db.getConnection();

    logger.info("✅ Database Connection Verified (Server.js)");
    connection.release(); // Important: Release it back immediately!

    // Only start listening if DB is connected
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // ==========================================
    // Graceful Shutdown (Railway SIGTERM)
    // ==========================================
    const gracefulShutdown = (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);

      server.close(() => {
        logger.info('HTTP server closed.');
        db.end(); // ✅ Close your MySQL/DB pool cleanly
        logger.info('DB pool closed. Exiting.');
        process.exit(0);
      });

      // Force exit if shutdown takes too long
      setTimeout(() => {
        logger.error('Forced shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

  } catch (err) {
    logger.error("❌ Failed to connect to Database. Server shutting down.");
    logger.error(`Error: ${err.message}`);

    // Exit with failure code so Heroku knows to restart the dyno
    process.exit(1);
  }
};

startServer();