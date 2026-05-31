import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { requestId } from './middleware/requestId.js';
import { httpLogger } from './middleware/logger.js';
import { jsonBodyLimit } from './middleware/limits.js';
import { errorHandler, notFound } from './middleware/error.js';
import { healthRouter } from './routes/v1/health.js';
import { embeddingsRouter } from './routes/v1/embeddings.js';
import { bm25Router } from './routes/v1/search/bm25.js';
import { vectorRouter } from './routes/v1/search/vector.js';
import { hybridRouter } from './routes/v1/search/hybrid.js';
import { rerankRouter } from './routes/v1/search/rerank.js';
import { summarizeRouter } from './routes/v1/search/summarize.js';
import { searchRouter } from './routes/v1/search/index.js';
import { ingestionRouter } from './modules/ingestion/ingestion.routes.js';

export function createApp() {
  const app = express();

  // Core middleware
  app.use(requestId());
  app.use(httpLogger);
  app.use(helmet());
  app.use(cors({ origin: true }));
  app.use(...jsonBodyLimit('1mb'));

  // Routes
  app.use('/v1/health', healthRouter);
  app.use('/v1/embeddings', embeddingsRouter);
  app.use('/v1/search/bm25', bm25Router);
  app.use('/v1/search/vector', vectorRouter);
  app.use('/v1/search/hybrid', hybridRouter);
  app.use('/v1/search/rerank', rerankRouter);
  app.use('/v1/search/summarize', summarizeRouter);
  app.use('/v1/search', searchRouter);
  app.use('/api/resumes', ingestionRouter);

  // 404 and error handling
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
