import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl, requestId: req.requestId });
}

// Centralized error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const status = (err as any)?.statusCode ?? 500;
  const code = (err as any)?.code ?? 'INTERNAL_ERROR';
  const message = (err as any)?.message ?? 'Internal Server Error';
  logger.error({ err, requestId: req.requestId, code, status }, 'Request failed');
  if (status >= 500) {
    res.status(status).json({ error: 'Internal Server Error', code, requestId: req.requestId });
  } else {
    res.status(status).json({ error: message, code, requestId: req.requestId });
  }
}
