const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');

const envPath = path.join(__dirname, `src/config/.env_${process.env.NODE_ENV || 'local'}`);
require('dotenv').config({ path: envPath });

const config = require('./src/config/config');
const { initializeAllConnections, closeAllConnections } = require('./src/db/mssqlPool');
const { connectDB, closeDB } = require('./src/db/conn');
const routes = require('./src/routes');

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173'];

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(config.prefix, routes);

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({
    status: 'FAILURE',
    message: error.message || 'Internal Server Error',
  });
});

const server = http.createServer(app);

(async () => {
  await connectDB();
  await initializeAllConnections();

  server.listen(config.PORT, () => {
    console.log(`Server running at ${config.baseURL || `http://localhost:${config.PORT}`}`);
  });

  const shutdown = async () => {
    await closeAllConnections();
    await closeDB();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
