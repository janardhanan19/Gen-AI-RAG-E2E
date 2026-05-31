import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger.js';
import { PdfService } from '../../services/pdf/pdf.service.js';
import { CleanerService } from '../../services/cleaner/cleaner.service.js';
import { ParserService } from '../../services/parser/parser.service.js';
import { IngestionEmbeddingService } from '../../services/embedding/embedding.service.js';
import { ResumeRepository } from '../../repositories/ResumeRepository.js';
import { assertUsableText, validateParsedResume } from './ingestion.validator.js';

// Phase 6 — MongoDB Storage.
// The controller reads the uploaded PDF buffer, extracts raw text via
// PdfService, normalizes it via CleanerService, converts it into a
// structured ParsedResume via ParserService, generates a 1024-dim embedding
// from the parsed fields via IngestionEmbeddingService, then assembles the
// final document (parsed fields + embedding + rawText + metadata) and
// persists it via ResumeRepository.insertResume.
export async function ingestResume(req: Request, res: Response, next: NextFunction) {
  try {
    // validateUpload guarantees req.file exists by this point.
    const file = req.file!;
    logger.info(
      { requestId: req.requestId, fileName: file.originalname, fileSize: file.size },
      'Ingestion started',
    );

    const { text, pages, charCount } = await PdfService.extractText(file.buffer, req.requestId);
    logger.info({ requestId: req.requestId, charCount }, 'PDF text extracted');

    const { cleaned, originalLength, cleanedLength } = CleanerService.clean(text);
    logger.debug({ requestId: req.requestId, originalLength, cleanedLength }, 'Text cleaned');

    // Layer 2 hard guard: stop empty / image-only PDFs before parsing.
    assertUsableText(cleaned, req.requestId);

    const { parsed: rawParsed, fieldsExtracted } = ParserService.parse(cleaned);
    logger.info({ requestId: req.requestId, fieldsExtracted }, 'Parse complete');

    // Layer 2 soft guard: normalize missing fields (name → "Unknown"), warn.
    const parsed = validateParsedResume(rawParsed, req.requestId);

    const { vector, model, dimensions, input } = await IngestionEmbeddingService.generate(parsed);
    logger.info({ requestId: req.requestId, model, dimensions }, 'Embedding generated');

    const resumeId = await ResumeRepository.insertResume({
      uploadedAt: new Date(),
      source: 'upload',
      status: 'active',
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      skills: parsed.skills,
      experience: parsed.experience,
      education: parsed.education,
      rawText: cleaned,
      embedding: vector,
    });
    logger.info({ requestId: req.requestId, resumeId }, 'Resume stored');

    res.status(200).json({
      resumeId,
      received: true,
      requestId: req.requestId,
      file: {
        name: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      },
      extraction: {
        pages,
        charCount,
        preview: text.slice(0, 200),
      },
      cleaning: {
        originalLength,
        cleanedLength,
        preview: cleaned.slice(0, 200),
      },
      parsed,
      fieldsExtracted,
      embedding: {
        model,
        dimensions,
        inputPreview: input.slice(0, 200),
        vectorPreview: vector.slice(0, 5),
      },
    });
  } catch (err) {
    next(err);
  }
}
