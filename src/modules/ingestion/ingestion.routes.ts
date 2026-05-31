import { Router } from 'express';
import { uploadResume } from '../../middleware/upload.middleware.js';
import { validateUpload } from './ingestion.validator.js';
import { ingestResume } from './ingestion.controller.js';

// POST /api/resumes/ingest
// Middleware chain: multer (memory storage + size/type limits)
//   → Layer 1 request validation → controller.
export const ingestionRouter = Router();

ingestionRouter.post('/ingest', uploadResume, validateUpload, ingestResume);
