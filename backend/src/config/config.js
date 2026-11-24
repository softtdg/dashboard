const config = {
  MODE: process.env.SERVER,
  PORT: process.env.PORT || 8090,
  baseURL: process.env.baseURL,
  prefix: '/api',
  mongoUri: process.env.mongoUri,
  mongoDbName: process.env.mongoDbName,
  mongoUriTDG: process.env.mongoUriTDG,
  mongoDbNameTDG: process.env.mongoDbNameTDG,
  mongoUriEng: process.env.mongoUriEng || process.env.mongoUri,
  mongoDbNameEng: process.env.mongoDbNameEng || 'tdg_eng',

  sqlBaseConfig: {
    server: process.env.sqlServer,
    port: parseInt(process.env.sqlPort, 10),
    user: process.env.sqlUser,
    password: process.env.sqlPassword,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      requestTimeout: 120000,
      connectionTimeout: 60000,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  },

  databases: {
    sop: process.env.sop_database,
    qa: process.env.qa_database,
    design: process.env.design_database,
    electrical: process.env.electrical_database,
    overview: process.env.overview_database,
    purchasing: process.env.purchasing_database,
  },

  getDatabaseConfig(dbName) {
    const database = this.databases[dbName];
    if (!database) {
      throw new Error(`Database configuration for '${dbName}' not found`);
    }

    const server = process.env[`${dbName}_server`];
    if (!server) {
      return { ...this.sqlBaseConfig, database };
    }

    return {
      ...this.sqlBaseConfig,
      database,
      server,
      port: parseInt(process.env[`${dbName}_sqlPort`] || process.env.sqlPort, 10),
      user: process.env[`${dbName}_sqlUser`] || process.env.sqlUser,
      password: process.env[`${dbName}_sqlPassword`] || process.env.sqlPassword,
    };
  },
};

module.exports = config;
