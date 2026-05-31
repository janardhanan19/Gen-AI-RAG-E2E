import type { RequestHandler } from 'express';
import express from 'express';

export function jsonBodyLimit(limit: string = '1mb'): RequestHandler[] {
  return [express.json({ limit })];
}
