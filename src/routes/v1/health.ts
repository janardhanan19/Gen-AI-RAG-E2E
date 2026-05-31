import { Router } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { getConfig } from '../../config/index.js';
import { pingMongo } from '../../lib/mongo.js';

const cfg = getConfig();
export const healthRouter = Router();

// Optionally tighten CORS/helmet policies per endpoint scope
healthRouter.use(helmet());
healthRouter.use(cors({ origin: true }));

healthRouter.get('/', (req, res) => {
  res.json({
    name: cfg.appName,
    version: cfg.version,
    env: cfg.NODE_ENV,
    uptimeSec: Math.floor(process.uptime()),
    requestId: req.requestId,
  });
});

healthRouter.get('/db', async (req, res, next) => {
  try {
    const { ok, latencyMs } = await pingMongo();
    res.json({ ok, latencyMs, requestId: req.requestId });
  } catch (err) {
    next(Object.assign(new Error('MongoDB ping failed'), { statusCode: 503, code: 'DB_UNAVAILABLE' }));
  }
});
