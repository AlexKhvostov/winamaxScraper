import mysql from 'mysql2/promise';
import { config } from '../../src/config/config.js';

export function createPool() {
  return mysql.createPool({
    host: config.database.host,
    user: config.database.username,
    password: config.database.password,
    database: config.database.database,
    port: config.database.port,
    connectionLimit: 10,
    connectTimeout: 10000
  });
}

export async function checkDatabaseConnection(pool) {
  try {
    if (pool) { await pool.execute('SELECT 1'); return true; }
    return false;
  } catch { return false; }
}


