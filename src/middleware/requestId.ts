import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

export function requestId(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const id = req.headers['x-request-id']?.toString() || uuidv4();
    req.requestId = id;
    res.setHeader('x-request-id', id);
    next();
  };
}
