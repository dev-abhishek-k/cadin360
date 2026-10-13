import { createApp } from './app.js';
import { validateEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

let config;
try { config = validateEnv(); }
catch (error) { console.error(error.message); process.exit(1); }

try {
  await connectDatabase(config.mongodbUri);
  const server = createApp(config).listen(config.port, () => console.log(`API listening on port ${config.port}`));
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    server.close(async () => {
      try { await disconnectDatabase(); process.exit(0); }
      catch { console.error('Database shutdown failed'); process.exit(1); }
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  const detail = error?.cause?.code || error?.code || error?.name || 'unknown error';
  console.error(`Database connection failed (${detail}). Check MONGODB_URI and that MongoDB is running.`);
  process.exit(1);
}
