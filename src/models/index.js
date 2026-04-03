import mysql from 'mysql2/promise';
import logger from '../utils/logger.js';

const useSSL = process.env.DB_SSL === 'true';

logger.debug(`DB Config: Connecting to ${process.env.DB_HOST} (SSL: ${useSSL ? 'Enabled' : 'Disabled'})`);

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306, // ✅ Add this — Railway uses a specific port
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  timezone: '+08:00',
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
};

const pool = mysql.createPool(dbConfig);

pool.on("error", (err) => {
  logger.error("❌ Database Connection Lost:", err);
});

// 👇 THIS WAS THE PROBLEM
pool.on('connection', function (connection) {
  // The 'connection' object here is the RAW (non-promise) connection.
  // We must use a standard callback, NOT .catch() or await.
  connection.query('SET SESSION time_zone = "+08:00"', (err) => {
    if (err) {
      logger.error("Failed to set timezone", err);
    }
  });
});

export default pool;