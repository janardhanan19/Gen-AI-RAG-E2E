Developer guidance for Augment Chat (implementation details)

Follow this roadmap (aligned with Architecture.md)
1) Scaffold
   - Create src/app.ts, src/server.ts; add express, cors, helmet, pino-like logger
   - Add middleware: requestId, json body limits, error handler
   - Add routes: GET /v1/health, /v1/health/db (stub Mongo ping)
   - Add src/config/index.ts: validates env (PORT, MONGODB_URI, MONGODB_DB, MISTRAL_API_KEY, GROQ_API_KEY, MISTRAL_EMBEDDING_MODEL?, GROQ_MODEL?)
2) Embeddings endpoint
   - Implement EmbeddingService: embed(text, model?) -> { vector, model }
   - POST /v1/embeddings: { model?, input } -> { embedding, model }
3) BM25 search
   - ResumeRepository.bm25Search(query, filters, topK) using Atlas Search pipeline across rawText + skills + jobTitles + experienceSummary
   - Route: POST /v1/search/bm25
4) Vector search
   - ResumeRepository.vectorSearch(embedding, filters, topK) (cosine)
   - SearchService.vectorSearch(query, ...) uses EmbeddingService once, then repository
   - Route: POST /v1/search/vector
5) Hybrid search
   - SearchService.hybridSearch runs bm25 & vector in parallel; return both lists (no score merge)
   - Route: POST /v1/search/hybrid
6) Rerank
   - LLMService.rerankCandidates() reads prompts/templates/rerank.prompt.txt, returns strictly-validated JSON
   - Route: POST /v1/search/rerank
7) Summarize
   - LLMService.summarizeCandidateFit() uses prompts/templates/summarize.prompt.txt, returns { summary }
   - Route: POST /v1/search/summarize
8) Full pipeline
   - SearchService.endToEndSearch: embed once  bm25  vector  dedupe  LLM rerank (top N)  optional summarize
   - Route: POST /v1/search
9) Tests
   - Unit tests for each service; minimal integration tests for key routes

Endpoint contracts (concise)
- GET /v1/health -> { name, version, uptimeSec }
- GET /v1/health/db -> { ok: boolean, latencyMs }
- POST /v1/embeddings { model?, input } -> { embedding: number[], model }
- POST /v1/search/bm25 { query, topK?, filters? } -> { results: Candidate[] }
- POST /v1/search/vector { query, topK?, filters? } -> { results: Candidate[] }
- POST /v1/search/hybrid { query, topK?, filters? } -> { bm25: Candidate[], vector: Candidate[] }
- POST /v1/search/rerank { query, candidates: Candidate[], topK? } -> { ranked: RankedCandidate[] }
- POST /v1/search/summarize { query, candidate: Candidate, style?: 'short'|'detailed', maxTokens?: number } -> { summary: string }
- POST /v1/search { query, topK?, filters?, summarize?: boolean, summarizeTopK?: number } -> { ranked: RankedCandidate[], summaries?: Record<resumeId,string>, fallback?: {...} }

Types (sketch)
- Candidate = { resumeId: string; snippet: string; score?: number }
- RankedCandidate = Candidate & { rank: number; rerankScore: number; reason?: string }

Config keys (env)
- PORT (3002), NODE_ENV
- MONGODB_URI, MONGODB_DB
- MISTRAL_API_KEY, MISTRAL_EMBEDDING_MODEL (default: mistral-embed)
- GROQ_API_KEY, GROQ_MODEL (default: meta-llama/llama-4-scout-17b-16e-instruct)
- LOG_LEVEL (info|debug|error)

Implementation rules
- Validate all inputs (zod recommended) and bound topK (default 20, max 100)
- Add requestId (uuid v4) on req; include in logs and responses
- Keep external calls time-bounded (e.g., 10s) with 2 retries + jitter on 5xx
- Do not exceed N candidates to rerank (default 810 via config)
- Deduplicate by resumeId before rerank; maintain stable order for ties
- Include componentTimings in logs (embeddingMs, bm25Ms, vectorMs, rerankMs, summarizeMs)
- Never leak API keys or raw provider errors; wrap and map to 4xx/5xx

LLM I/O contracts
- Rerank: MUST return JSON per prompts/templates/rerank.prompt.txt, parse strictly and reject if malformed
- Summarize: MUST return JSON { summary: string } per templates; bound length by maxTokens on the provider side
- Extract metadata: JSON { skills: string[], jobTitles: string[], experienceSummary: string }

Definition of Done
- Types compile with strict TS config; eslint passes
- All routes return typed JSON with versioned paths and correct status codes
- Unit tests cover happy paths and key failures/fallbacks
- Logs include requestId and timings; no secrets in logs
