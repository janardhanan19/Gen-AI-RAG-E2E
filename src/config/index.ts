import 'dotenv/config';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3002),
  MONGODB_URI: z.string().url(),
  MONGODB_DB: z.string().min(1),
  // Future services (not required at scaffold step)
  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_EMBEDDING_MODEL: z.string().optional(),
  // Expected embedding vector length; used as a Layer-2 hard check during
  // ingestion (mistral-embed returns 1024 dims, matching the Atlas index).
  MISTRAL_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  GROQ_RERANK_MODEL: z.string().optional(),
  GROQ_SUMMARIZE_MODEL: z.string().optional(),
  // Number of merged candidates sent to LLM re-ranking (default 10, per Architecture.md)
  RERANK_TOPN: z.coerce.number().int().positive().max(50).default(10),
  LOG_LEVEL: z.enum(['debug', 'info', 'error']).default('info').optional(),
  // Optional search-related config
  RESUMES_COLLECTION: z.string().optional(),
  ATLAS_SEARCH_INDEX_BM25: z.string().optional(),
  ATLAS_SEARCH_INDEX_VECTOR: z.string().optional(),
  // Resume ingestion config
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().max(50).default(10),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  appName: string;
  version: string;
  commit?: string;
};

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (cached) return cached;
  // Backward-compatible aliases: support DB_NAME -> MONGODB_DB, GROQ_RERANK_MODEL -> GROQ_MODEL (if GROQ_MODEL absent)
  const envIn = {
    ...process.env,
    MONGODB_DB: process.env.MONGODB_DB ?? process.env.DB_NAME,
    GROQ_MODEL: process.env.GROQ_MODEL ?? process.env.GROQ_RERANK_MODEL,
  } as NodeJS.ProcessEnv;

  const parsed = EnvSchema.safeParse(envIn);
  if (!parsed.success) {
    // Flatten zod errors for readable startup failure
    const msg = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const pkgPath = resolve(__dirname, '../../package.json');
  const pkgRaw = readFileSync(pkgPath, 'utf8');
  const pkgJson = JSON.parse(pkgRaw) as { name?: string; version?: string };
  cached = {
    ...parsed.data,
    appName: pkgJson.name ?? 'rag-resume-search',
    version: pkgJson.version ?? '0.0.0',
    commit: process.env.GIT_COMMIT,
  } as AppConfig;
  return cached;
}
