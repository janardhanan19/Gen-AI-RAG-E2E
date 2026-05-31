import pinoHttp from 'pino-http';
import type { Request, Response } from 'express';
import { logger } from '../lib/logger.js';

// pino-http ships CJS-style typings; coerce to callable to satisfy TS under NodeNext ESM
const pinoHttpFn: (opts?: any) => any = (pinoHttp as unknown as (opts?: any) => any);

export const httpLogger = pinoHttpFn({
  logger,
  autoLogging: true,
  customProps: (req: Request) => ({ requestId: req.requestId }),
  customSuccessMessage(req: Request, res: Response) {
    return `${req.method} ${req.url} -> ${res.statusCode}`;
  },
});
