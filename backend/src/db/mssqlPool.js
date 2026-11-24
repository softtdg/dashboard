const sql = require('mssql');
const config = require('../config/config');

sql.on('error', (err) => console.error('SQL global error:', err));

const databasePools = {};

async function initializeAllConnections() {
  for (const dbName of Object.keys(config.databases)) {
    if (databasePools[dbName]) continue;
    try {
      const dbConfig = config.getDatabaseConfig(dbName);
      const pool = await new sql.ConnectionPool(dbConfig).connect();
      databasePools[dbName] = pool;
      console.log(`Connected to ${dbName} on ${dbConfig.server} (${dbConfig.database})`);
    } catch (err) {
      console.error(`Failed to connect ${dbName}:`, err.message);
      databasePools[dbName] = null;
    }
  }
}

function getPool(dbName) {
  if (!dbName) return null;
  const key = Object.keys(databasePools).find(
    (k) => k.toLowerCase() === String(dbName).toLowerCase(),
  );
  return key ? databasePools[key] : null;
}

async function query(dbName, queryStr, params = {}) {
  const pool = getPool(dbName);
  if (!pool) throw new Error(`No active pool for DB: ${dbName}`);

  const request = pool.request();
  for (const [key, value] of Object.entries(params)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      typeof value.type === 'function' &&
      Object.prototype.hasOwnProperty.call(value, 'value')
    ) {
      request.input(key, value.type, value.value);
    } else {
      request.input(key, value);
    }
  }

  const result = await request.query(queryStr);
  return result.recordset;
}

async function execute(databaseKey, queryText, params = {}) {
  const pool = getPool(databaseKey);
  if (!pool) throw new Error(`No active pool for DB: ${databaseKey}`);
  const request = pool.request();
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }
  return request.query(queryText);
}

async function closeAllConnections() {
  for (const [dbName, pool] of Object.entries(databasePools)) {
    if (!pool) continue;
    try {
      await pool.close();
      console.log(`Closed ${dbName}`);
    } catch (err) {
      console.error(`Error closing ${dbName}:`, err.message);
    }
    delete databasePools[dbName];
  }
}

module.exports = {
  initializeAllConnections,
  query,
  execute,
  closeAllConnections,
  databasePools,
  getPool,
  sql,
};
