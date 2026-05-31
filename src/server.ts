import { createServer } from 'http';
import { createApp } from './app.js';
import { getConfig } from './config/index.js';
import { connectMongo, closeMongo } from './lib/mongo.js';
import { logger } from './lib/logger.js';

async function main() {
  const cfg = getConfig();
  // Establish DB connection on boot (non-fatal if unavailable)
  try {
    await connectMongo();
  } catch (err) {
    logger.warn({ err }, 'MongoDB connection failed at startup; continuing without DB. /v1/health/db will report 503');
  }

  const app = createApp();
  const server = createServer(app);
  server.listen(cfg.PORT, () => {
    logger.info({ port: cfg.PORT, env: cfg.NODE_ENV }, 'Server listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await closeMongo().catch(() => void 0);
      logger.info('Closed Mongo connection');
      process.exit(0);
    });
    // safety timeout
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
