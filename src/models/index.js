import mysql from 'mysql2/promise';
import logger from '../utils/logger.js';

// Log configuration (Good for debugging, but keeps password hidden)
logger.debug(`DB Config: Connecting to ${process.env.DB_HOST} as ${process.env.DB_USER}`);

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create the pool
const pool = mysql.createPool(dbConfig);

// Note: We removed the immediate connection test here because 
// we handle it in server.js inside the startServer() function.

export default pool;