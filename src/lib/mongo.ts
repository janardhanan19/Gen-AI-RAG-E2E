import { MongoClient, Db } from 'mongodb';
import { getConfig } from '../config/index.js';
import { logger } from './logger.js';

let client: MongoClient | undefined;
let db: Db | undefined;

export async function connectMongo(): Promise<Db> {
  const cfg = getConfig();
  if (db) return db;
  const start = Date.now();
  client = new MongoClient(cfg.MONGODB_URI, {
    monitorCommands: false,
  });
  await client.connect();
  db = client.db(cfg.MONGODB_DB);
  logger.info({ component: 'mongo', event: 'connected', ms: Date.now() - start }, 'MongoDB connected');
  return db;
}

export async function pingMongo(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  if (!client || !db) await connectMongo();
  await db!.command({ ping: 1 });
  return { ok: true, latencyMs: Date.now() - start };
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
  }
}
