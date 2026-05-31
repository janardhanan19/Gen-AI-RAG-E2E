# PR & Code Review Checklist (RAG Resume Search)

Architecture
- [ ] Follows layered structure (routes → services → repositories → middleware → config)
- [ ] Endpoints and service contracts match Architecture.md

Correctness & Safety
- [ ] Inputs validated (types, bounds, size limits)
- [ ] Fallbacks implemented (bm25/vector/rerank) and flagged in responses
- [ ] No secrets or provider error payloads in logs or errors
- [ ] Timeouts and retries on external calls

Observability
- [ ] requestId in all logs and responses where applicable
- [ ] componentTimings captured (embeddingMs, bm25Ms, vectorMs, rerankMs, summarizeMs)

Testing
- [ ] Unit tests for services; route tests for key endpoints
- [ ] TypeScript strict passes; linter passes

Performance
- [ ] BM25 and vector executed in parallel when appropriate
- [ ] Rerank limited to top N (configurable)

Docs & Config
- [ ] README updated if behavior/config changes
- [ ] Env vars documented; defaults reasonable and safe

Review notes
- [ ] Names, types, and error messages are consistent and descriptive
- [ ] Comments/docstrings explain non-obvious logic; no dead code
