# Resume Ingestion — Backend Architecture Document

> **Scope:** Adding a Resume Ingestion feature to an existing Resume Search/Retrieval backend.
> **Stack:** Node.js · Express · TypeScript · MongoDB Atlas · Mistral Embedding API

---

## 1. Feature Overview

The Resume Ingestion feature allows users to upload a resume PDF.
The backend will read it, extract structured data using regex and keyword matching, generate a single embedding vector using Mistral, and store everything as one document in MongoDB.

That stored document will later be used by the existing Resume Search system.

**One resume → One document → One embedding vector.**

---

## 2. Recommended Backend Flow

```
Client uploads resume PDF
        ↓
POST /api/resumes/ingest
        ↓
Multer middleware (file validation + temporary storage)
        ↓
IngestionController
        ↓
PDFService       → Extracts raw text from PDF
        ↓
CleanerService   → Cleans and normalizes raw text
        ↓
ParserService    → Extracts structured fields (regex + keyword matching)
        ↓
EmbeddingService → Calls Mistral API → returns 1024-dim vector
        ↓
ResumeRepository → Saves structured JSON + vector to MongoDB
        ↓
Response: { success: true, resumeId }
```

---

## 3. Suggested Folder Structure

Add the following inside your existing project. Only new folders/files are listed.

```
src/
├── modules/
│   └── ingestion/
│       ├── ingestion.routes.ts        ← Route definitions
│       ├── ingestion.controller.ts    ← Request handling
│       ├── ingestion.service.ts       ← Orchestration logic
│       ├── ingestion.validator.ts     ← Request-level validation
│       └── ingestion.types.ts         ← TypeScript interfaces
│
├── services/
│   ├── pdf/
│   │   └── pdf.service.ts             ← PDF-to-text extraction
│   ├── cleaner/
│   │   └── cleaner.service.ts         ← Text cleaning/normalization
│   ├── parser/
│   │   ├── parser.service.ts          ← Orchestrates all parsing
│   │   ├── sections/
│   │   │   ├── contact.parser.ts      ← name, email, phone
│   │   │   ├── skills.parser.ts       ← skills list
│   │   │   ├── experience.parser.ts   ← job history
│   │   │   └── education.parser.ts    ← degrees, institutions
│   │   └── parser.utils.ts            ← Shared regex/keyword helpers
│   └── embedding/
│       └── embedding.service.ts       ← Mistral API integration
│
├── repositories/
│   └── resume.repository.ts           ← All MongoDB operations
│
├── models/
│   └── resume.model.ts                ← Mongoose schema definition
│
├── middlewares/
│   └── upload.middleware.ts           ← Multer config
│
├── config/
│   └── mistral.config.ts              ← Mistral API config
│
└── utils/
    └── logger.ts                      ← Logging utility (if not existing)
```

---

## 4. File Responsibilities

| File | What it does |
|---|---|
| `ingestion.routes.ts` | Registers `POST /api/resumes/ingest` with middleware chain |
| `ingestion.controller.ts` | Receives request, calls service, sends response |
| `ingestion.service.ts` | Orchestrates the full pipeline in order |
| `ingestion.validator.ts` | Validates file type, size, MIME type before processing |
| `ingestion.types.ts` | Defines `ParsedResume`, `ResumeDocument` interfaces |
| `pdf.service.ts` | Reads the uploaded file buffer, returns raw text string |
| `cleaner.service.ts` | Removes noise (extra spaces, special chars, page numbers) |
| `parser.service.ts` | Calls section parsers, assembles the structured object |
| `contact.parser.ts` | Regex for email, phone; heuristic for name |
| `skills.parser.ts` | Keyword list matching for skills |
| `experience.parser.ts` | Pattern matching for job titles, companies, dates |
| `education.parser.ts` | Pattern matching for degrees, institutions, years |
| `parser.utils.ts` | Shared helpers: `findSection()`, `extractDates()`, etc. |
| `embedding.service.ts` | Sends cleaned text to Mistral, returns `number[]` |
| `resume.repository.ts` | `insertOne()`, `findById()`, handles MongoDB operations |
| `resume.model.ts` | Mongoose schema with vector field |
| `upload.middleware.ts` | Multer setup: memory storage, 10MB limit, PDF-only |
| `mistral.config.ts` | Mistral base URL, API key from env, model name |

---

## 5. Processing Flow

This shows how data moves from request to database.

```
Step 1 — Receive
  POST /api/resumes/ingest
  Body: multipart/form-data with file

Step 2 — Validate (ingestion.validator.ts)
  - File exists?
  - MIME type is application/pdf?
  - File size within limit?
  → Reject early if any check fails

Step 3 — Extract Text (pdf.service.ts)
  - Read file buffer from memory (Multer)
  - Use pdf-parse library to extract raw text
  → Output: raw string

Step 4 — Clean Text (cleaner.service.ts)
  - Remove headers/footers/page numbers
  - Collapse extra whitespace
  - Normalize unicode characters
  - Strip irrelevant symbols
  → Output: clean normalized string

Step 5 — Parse Resume (parser.service.ts)
  - Detect section boundaries (EXPERIENCE, EDUCATION, SKILLS, etc.)
  - Run each section parser on its slice of text
  - Assemble into ParsedResume object
  → Output: structured JSON object

Step 6 — Generate Embedding (embedding.service.ts)
  - Build input text from key fields (skills + experience summary + title)
  - POST to Mistral API with model: mistral-embed
  - Receive 1024-dimensional float array
  → Output: number[] of length 1024

Step 7 — Store (resume.repository.ts)
  - Combine ParsedResume + embedding + metadata
  - Insert as single document into MongoDB
  → Output: insertedId (returned to client)
```

---

## 6. Database Structure

### Collection: `resumes`

```
{
  _id: ObjectId,

  // Metadata
  uploadedAt: Date,
  source: "upload",
  status: "active",

  // Contact
  name: String,
  email: String,
  phone: String,

  // Skills
  skills: [String],                  // ["Node.js", "TypeScript", "MongoDB"]

  // Experience
  experience: [
    {
      title: String,                 // "Software Engineer"
      company: String,               // "Acme Corp"
      startDate: String,             // "Jan 2021"
      endDate: String,               // "Mar 2023" or "Present"
      description: String            // raw text of that job block
    }
  ],

  // Education
  education: [
    {
      degree: String,                // "B.Tech Computer Science"
      institution: String,           // "IIT Bombay"
      year: String                   // "2019"
    }
  ],

  // Raw text (keep for debugging/reprocessing)
  rawText: String,

  // Embedding
  embedding: [Number],               // 1024 floats from Mistral

  // Optional LLM enrichment (future use)
  llmEnriched: Boolean,
  llmData: Object
}
```

### MongoDB Atlas Vector Search Index

Create this index on the `resumes` collection to enable vector search from the existing retrieval system.

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1024,
      "similarity": "cosine"
    }
  ]
}
```

> This index connects directly to your existing Resume Search feature.

---

## 7. Embedding Flow

```
Clean text available
        ↓
Build embedding input string
  → Combine: skills joined + experience titles + education degrees
  → Keep it concise but representative
  → Do NOT send rawText (too long, noisy)
        ↓
POST https://api.mistral.ai/v1/embeddings
  Body: {
    model: "mistral-embed",
    input: "<combined resume text>"
  }
  Header: Authorization: Bearer <MISTRAL_API_KEY>
        ↓
Response: { data: [{ embedding: [0.12, -0.34, ...] }] }
        ↓
Extract embedding array (1024 numbers)
        ↓
Store in resume document as embedding field
```

### Environment Variables Needed

| Variable | Purpose |
|---|---|
| `MISTRAL_API_KEY` | API key for Mistral |
| `MISTRAL_EMBEDDING_MODEL` | Set to `mistral-embed` |
| `MISTRAL_EMBEDDING_DIMENSIONS` | Set to `1024` |
| `USE_LLM_PARSER` | `false` by default, `true` to enable LLM parsing later |
| `MAX_UPLOAD_SIZE_MB` | Max file size in MB (e.g. `10`) |

---

## 8. Validation Strategy

Validation happens in two layers.

### Layer 1 — Request Validation (before processing)

| Check | Rule | Action on Fail |
|---|---|---|
| File present | `req.file` must exist | 400 Bad Request |
| MIME type | Must be `application/pdf` | 400 Bad Request |
| File size | Must be ≤ configured limit | 413 Payload Too Large |
| File name | Must end with `.pdf` | 400 Bad Request |

### Layer 2 — Parse Validation (after processing)

| Check | Rule | Action on Fail |
|---|---|---|
| Email found | Must match standard email regex | Log warning, store as null |
| Skills found | Array must not be empty | Log warning, continue |
| Embedding length | Must be exactly 1024 | 500 Internal Error |
| Name found | At least one word extracted | Log warning, store as "Unknown" |

> Soft failures (missing name, no skills) should not stop ingestion. The document should still be saved with whatever data was extracted. Hard failures (no embedding, Mistral error) should stop the pipeline and return an error.

---

## 9. Error Handling

### Error Types and Responses

| Error | HTTP Code | Log Level |
|---|---|---|
| No file uploaded | 400 | warn |
| Invalid file type | 400 | warn |
| PDF parse failure | 422 | error |
| Mistral API timeout | 503 | error |
| Mistral API error response | 502 | error |
| MongoDB insert failure | 500 | error |
| General unexpected error | 500 | error |

### Handling Mistral Failures

- Retry once with a 1-second delay
- If retry also fails, return 503 with message: `"Embedding generation failed. Please try again."`
- Do not store a partial document without an embedding (the document would be unsearchable)

### Consistent Error Response Shape

```json
{
  "success": false,
  "error": {
    "code": "EMBEDDING_FAILED",
    "message": "Could not generate embedding from Mistral API",
    "retryable": true
  }
}
```

---

## 10. Logging Strategy

Use your existing logger (Winston or Pino recommended). Add structured logs at each pipeline step.

### What to Log

| Event | Level | Fields to Include |
|---|---|---|
| Ingestion started | info | `requestId`, `fileName`, `fileSize` |
| PDF text extracted | info | `requestId`, `charCount` |
| Text cleaned | debug | `requestId`, `originalLength`, `cleanedLength` |
| Parse complete | info | `requestId`, `fieldsExtracted` (list of field names found) |
| Embedding requested | info | `requestId`, `inputLength` |
| Embedding received | info | `requestId`, `dimensions` |
| Resume saved | info | `requestId`, `resumeId` |
| Validation failure | warn | `requestId`, `reason` |
| Any error | error | `requestId`, `stage`, `message`, `stack` |

### Request ID

Generate a unique `requestId` (UUID) at the controller level at the start of every ingestion request. Pass it through every service call so all logs for one upload can be traced together.

---

## 11. Phase-wise Implementation Plan

### Phase 1 — File Upload Foundation

Goal: Accept a PDF file and save it temporarily.

- Set up Multer middleware with memory storage
- Create `POST /api/resumes/ingest` route
- Add file type and size validation
- Return a dummy success response
- Test with Postman/curl

**Deliverable:** Route accepts PDF, validates it, returns `{ received: true }`.

---

### Phase 2 — PDF Text Extraction

Goal: Read the PDF and get raw text out of it.

- Install and configure `pdf-parse`
- Create `pdf.service.ts`
- Read file buffer from Multer's memory storage
- Extract raw text
- Log character count

**Deliverable:** Raw text is extracted and logged for any uploaded PDF.

---

### Phase 3 — Text Cleaning

Goal: Normalize the extracted text before parsing.

- Create `cleaner.service.ts`
- Remove page numbers, headers/footers, extra blank lines
- Normalize whitespace and encoding
- Test with a few real resume PDFs

**Deliverable:** Clean, normalized text string ready for parsing.

---

### Phase 4 — Resume Parsing

Goal: Convert clean text into a structured JSON object.

- Build `parser.utils.ts` with common helpers
- Build `contact.parser.ts` (name, email, phone)
- Build `skills.parser.ts` with keyword list
- Build `experience.parser.ts`
- Build `education.parser.ts`
- Assemble in `parser.service.ts`
- Test output on multiple resume formats

**Deliverable:** `ParsedResume` object populated with extracted fields.

---

### Phase 5 — Embedding Generation

Goal: Get a 1024-dimension vector from Mistral for each resume.

- Create `mistral.config.ts`
- Create `embedding.service.ts`
- Build the input string from parsed fields
- Call Mistral API, handle errors and retry
- Return the embedding array

**Deliverable:** 1024-dim float array returned for any resume input.

---

### Phase 6 — MongoDB Storage

Goal: Store the full resume document in MongoDB Atlas.

- Create `resume.model.ts` (Mongoose schema)
- Create `resume.repository.ts`
- Combine parsed data + embedding + metadata
- Insert into `resumes` collection
- Return inserted `_id` to the controller

**Deliverable:** Documents appear in MongoDB Atlas after upload.

---

### Phase 7 — Vector Search Index Setup

Goal: Make ingested resumes searchable by the existing search system.

- Go to MongoDB Atlas → Search Indexes
- Create a vector search index on `resumes.embedding`
- Dimensions: 1024, Similarity: cosine
- Verify the index is active

**Deliverable:** Existing Resume Search system can now find newly ingested resumes.

---

### Phase 8 — Integration Testing and Hardening

Goal: Make the full pipeline robust.

- Test with edge cases: empty PDFs, image-only PDFs, multi-page resumes
- Add soft-failure handling for missing parsed fields
- Add retry logic for Mistral API
- Add request-level logging with requestId
- Final review of error responses

**Deliverable:** Production-ready ingestion pipeline.

---

## 12. Final End-to-End Flow

```
┌────────────────────────────────────────────────────────────────┐
│  CLIENT                                                        │
│  POST /api/resumes/ingest  (multipart/form-data, file=resume) │
└──────────────────────────┬─────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Multer    │  Memory storage, 10MB limit, PDF only
                    └──────┬──────┘
                           │
                    ┌──────▼──────────────┐
                    │ ingestion.validator │  MIME, size, presence checks
                    └──────┬──────────────┘
                           │
                    ┌──────▼──────────────┐
                    │ ingestion.controller│  Generate requestId, call service
                    └──────┬──────────────┘
                           │
                    ┌──────▼──────────────┐
                    │ ingestion.service   │  Orchestrates all steps below
                    └──────┬──────────────┘
                           │
              ┌────────────▼────────────┐
              │      pdf.service        │  Buffer → Raw text (pdf-parse)
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │    cleaner.service      │  Raw text → Clean text
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │    parser.service       │  Clean text → ParsedResume JSON
              │  ├── contact.parser     │
              │  ├── skills.parser      │
              │  ├── experience.parser  │
              │  └── education.parser   │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │   embedding.service     │  ParsedResume → Mistral API
              │                         │  → 1024-dim float[]
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │   resume.repository     │  Insert document into MongoDB
              └────────────┬────────────┘
                           │
                    ┌──────▼──────────────┐
                    │ ingestion.controller│  Return { success: true, resumeId }
                    └─────────────────────┘

MongoDB Atlas — resumes collection
  → Vector Search Index on embedding (1024 dims, cosine)
  → Queryable by existing Resume Search system
```

---

*This document covers only backend architecture and implementation planning. No implementation code is included. Build phase by phase, verify each step before moving to the next.*
