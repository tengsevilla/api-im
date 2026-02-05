import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from './utils/logger.js';
import db from './models/index.js'; // This imports the 'pool' from your model

// Route Imports
import accountRoutes from './routes/account.routes.js';
import clientRoutes from './routes/client.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import transactionRoutes from './routes/transactions.routes.js';
import analyticsRoutes from './routes/analytics.routes.js'
// import bcrypt from "bcrypt";
// const salt = await bcrypt.genSalt(10);
// const hash = await bcrypt.hash('kdpogi0620', salt);

// console.log(`Hashed password for testing: ${hash}`);
const app = express();
const PORT = process.env.PORT || 3030;

// ==========================================
// Middleware
// ==========================================

app.use(helmet());

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "clientid"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// app.use((req, res, next) => {
//   logger.http(`${req.method} ${req.url} - IP: ${req.ip}`);
//   next();
// });

// ==========================================
// Routes
// ==========================================

app.get("/", (req, res) => {
  res.json({ message: "Inventory Management API (ESM) is live." });
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
    // 🔍 HERE IS THE CHECK YOU WANTED
    // We explicitly ask for a connection from the pool to ensure DB is alive.
    const connection = await db.getConnection();

    logger.info("✅ Database Connection Verified (Server.js)");
    connection.release(); // Important: Release it back immediately!

    // Only start listening if DB is connected
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (err) {
    logger.error("❌ Failed to connect to Database. Server shutting down.");
    logger.error(`Error: ${err.message}`);
    process.exit(1); // Kill the process so it can be restarted cleanly
  }
};

startServer();