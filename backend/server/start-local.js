/**
 * NEUROVAULT — Local Dev Starter with In-Memory MongoDB
 * Use when Atlas is unavailable or for offline development.
 * 
 * Usage: node start-local.js
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

console.log('[LocalDev] Starting in-memory MongoDB...');
const mongod = await MongoMemoryServer.create();
const uri = mongod.getUri();
console.log(`[LocalDev] MongoDB ready at: ${uri}`);

// Set env before importing server
process.env.MONGODB_URI = uri;
process.env.NODE_ENV = 'development';

// Now start the actual server
const { default: startApp } = await import('./index.js');

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[LocalDev] Shutting down...');
  await mongod.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mongod.stop();
  process.exit(0);
});
