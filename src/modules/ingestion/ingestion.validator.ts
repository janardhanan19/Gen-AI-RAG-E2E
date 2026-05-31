import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger.js';
import type { ParsedResume } from './ingestion.types.js';

// Layer 1 — request validation (runs after multer has populated req.file).
// File size is already enforced by multer's limits; here we confirm presence,
// MIME type, and the .pdf extension before the file enters the pipeline.
export function validateUpload(req: Request, _res: Response, next: NextFunction) {
  const file = req.file;

  if (!file) {
    logger.warn({ requestId: req.requestId, reason: 'no_file' }, 'Ingestion validation failed');
    const err: any = new Error('No file uploaded. Send a PDF using the "resume" field');
    err.statusCode = 400;
    err.code = 'NO_FILE';
    return next(err);
  }

  if (file.mimetype !== 'application/pdf') {
    logger.warn(
      { requestId: req.requestId, reason: 'invalid_mime', mimetype: file.mimetype },
      'Ingestion validation failed',
    );
    const err: any = new Error('Only PDF files are accepted');
    err.statusCode = 400;
    err.code = 'INVALID_FILE_TYPE';
    return next(err);
  }

  if (!file.originalname.toLowerCase().endsWith('.pdf')) {
    logger.warn(
      { requestId: req.requestId, reason: 'invalid_extension', fileName: file.originalname },
      'Ingestion validation failed',
    );
    const err: any = new Error('File name must end with .pdf');
    err.statusCode = 400;
    err.code = 'INVALID_FILE_EXTENSION';
    return next(err);
  }

  next();
}

// Layer 2 — guard against empty / image-only PDFs (doc section 8 edge cases).
// pdf-parse extracts no usable text from scanned/image-only documents, leaving
// nothing to parse or embed. This is a hard failure: throw 422 so the request
// stops before reaching the parser/embedding stages.
export function assertUsableText(cleaned: string, requestId?: string): void {
  if (cleaned.replace(/\s/g, '').length === 0) {
    logger.error({ requestId, reason: 'empty_text' }, 'No usable text extracted from PDF');
    const err: any = new Error(
      'No readable text found in the PDF. It may be empty or image-only (scanned).',
    );
    err.statusCode = 422;
    err.code = 'EMPTY_PDF_TEXT';
    throw err;
  }
}

// Layer 2 — soft parse validation (doc section 8). Missing name/email/skills
// must NOT stop ingestion; we log a warning and fall back to safe defaults so
// the document is still stored with whatever was extracted. Returns a
// normalized copy of the parsed resume.
export function validateParsedResume(parsed: ParsedResume, requestId?: string): ParsedResume {
  const normalized: ParsedResume = { ...parsed };

  if (!normalized.name || normalized.name.trim().length === 0) {
    logger.warn({ requestId, field: 'name' }, 'Parsed resume missing name; defaulting to "Unknown"');
    normalized.name = 'Unknown';
  }

  if (!normalized.email || normalized.email.trim().length === 0) {
    logger.warn({ requestId, field: 'email' }, 'Parsed resume missing email');
  }

  if (!normalized.skills || normalized.skills.length === 0) {
    logger.warn({ requestId, field: 'skills' }, 'Parsed resume has no skills');
  }

  return normalized;
}
