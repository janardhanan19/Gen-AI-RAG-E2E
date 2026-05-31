# Augment Chat Prompts for RAG Resume Search Backend

These prompts configure Augment Chat to generate, edit, and debug code for this project: a Node.js + Express + TypeScript monolith with MongoDB, Mistral embeddings, and Groq LLM re‑ranking, as described in Architecture.md.

## How to use
- Set the System message to prompts/system.rag.md
- Set the Developer message to prompts/developer.rag.md
- The LLMService should load its model prompts from prompts/templates/*.prompt.txt
- Keep all code and configuration aligned with Architecture.md

## Directory
- prompts/system.rag.md — non‑negotiable system rules for this repo
- prompts/developer.rag.md — step‑by‑step implementation guidance and APIs to expose
- prompts/templates/rerank.prompt.txt — LLM re‑ranking instruction (JSON output)
- prompts/templates/summarize.prompt.txt — Candidate fit summary instruction (JSON output)
- prompts/templates/extract_metadata.prompt.txt — Resume metadata extraction (JSON output)
- prompts/checklist.md — PR & code review checklist

## Environment variables (expected)
- PORT (default 3002)
- NODE_ENV (development|production|test)
- MONGODB_URI, MONGODB_DB
- MISTRAL_API_KEY, MISTRAL_EMBEDDING_MODEL (default mistral-embed)
- GROQ_API_KEY, GROQ_MODEL (default meta-llama/llama-4-scout-17b-16e-instruct)
- LOG_LEVEL (info|debug|error)

## Conventions
- TypeScript strict, ES2022 target, ESM preferred; use ts-node/tsup/esbuild for dev/build
- src layout (see Architecture.md §Decisions):
  - src/app.ts, src/server.ts
  - src/routes/*, src/services/*, src/repositories/*, src/middleware/*, src/config/*, src/types/*
- Error handling via centralized error middleware; never throw untyped errors to Express
- Structured JSON logging with requestId and component timings
- All external calls (MongoDB, Mistral, Groq) wrapped in typed clients with retries and timeouts
- Use package managers for any dependency changes (npm, pnpm, or yarn) — never edit lockfiles by hand

## Tests & Verification
- Unit tests for services, lightweight integration tests for routes
- Safe verification runs allowed: lint, typecheck, unit/integration tests
- Avoid destructive operations and never print secret values in logs or errors

## Notes
- This prompt pack is intentionally opinionated and mirrors Architecture.md
- If the architecture evolves, update these prompt files first and regenerate code incrementally
