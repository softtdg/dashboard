const express = require('express');
const config = require('../config/config');
const { query, getPool } = require('../db/mssqlPool');
const { databases } = require('../db/conn');

const router = express.Router();

router.get('/', async (req, res) => {
  const sql = {};
  for (const dbName of Object.keys(config.databases)) {
    const pool = getPool(dbName);
    if (!pool) {
      sql[dbName] = {
        connected: false,
        database: config.databases[dbName],
        error: 'No active pool',
      };
      continue;
    }
    try {
      const rows = await query(dbName, 'SELECT DB_NAME() AS name');
      sql[dbName] = { connected: true, database: rows[0]?.name };
    } catch (err) {
      sql[dbName] = {
        connected: false,
        database: config.databases[dbName],
        error: err.message,
      };
    }
  }

  const mongo = {};
  for (const [name, db] of Object.entries(databases)) {
    if (!db) {
      mongo[name] = { connected: false, error: 'Not connected' };
      continue;
    }
    try {
      await db.command({ ping: 1 });
      mongo[name] = { connected: true, database: db.databaseName };
    } catch (err) {
      mongo[name] = { connected: false, database: db.databaseName, error: err.message };
    }
  }

  const sqlOk = Object.values(sql).every((item) => item.connected);
  const mongoOk = Object.values(mongo).every((item) => item.connected);

  res.status(sqlOk && mongoOk ? 200 : 207).json({
    status: sqlOk && mongoOk ? 'SUCCESS' : 'PARTIAL',
    sql,
    mongo,
  });
});

module.exports = router;
