import pino from 'pino';
import { getConfig } from '../config/index.js';

const cfg = getConfig();

export const logger = pino({
  level: cfg.LOG_LEVEL ?? (cfg.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
