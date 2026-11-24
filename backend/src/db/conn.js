const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');
const config = require('../config/config');

const uri = config.mongoUri;
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

const uriTDG = config.mongoUriTDG;
const clientTDG =
  uriTDG && uriTDG !== uri
    ? new MongoClient(uriTDG, { serverSelectionTimeoutMS: 5000 })
    : client;

const uriEng = config.mongoUriEng;
const clientEng =
  uriEng && uriEng !== uri
    ? new MongoClient(uriEng, { serverSelectionTimeoutMS: 5000 })
    : client;

const databases = {};

async function connectNamed(label, mongoClient, dbName) {
  try {
    if (!mongoClient.topology?.isConnected()) {
      await mongoClient.connect();
    }
    databases[label] = mongoClient.db(dbName);
    await databases[label].command({ ping: 1 });
    console.log(`MongoDB connected (${label} / ${dbName})`);
  } catch (err) {
    databases[label] = null;
    console.error(`MongoDB connection failed (${label}):`, err.message);
  }
}

async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(uri, {
        dbName: config.mongoDbName,
        serverSelectionTimeoutMS: 5000,
        bufferCommands: false,
      });
      console.log(`Mongoose connected (${config.mongoDbName})`);
    } catch (err) {
      console.error('Mongoose connection failed:', err.message);
    }
  }

  await connectNamed('BOMs', client, config.mongoDbName);
  await connectNamed('TDG', clientTDG, config.mongoDbNameTDG);
  await connectNamed('tdg_eng', clientEng, config.mongoDbNameEng);

  return databases;
}

async function closeDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  const closed = new Set();
  for (const mongoClient of [client, clientTDG, clientEng]) {
    if (closed.has(mongoClient)) continue;
    closed.add(mongoClient);
    try {
      await mongoClient.close();
    } catch (err) {
      console.error('Mongo close error:', err.message);
    }
  }
}

module.exports = {
  connectDB,
  closeDB,
  databases,
  client,
  clientTDG,
  clientEng,
};
