import { createRequire } from 'node:module';
import { logger } from '../../lib/logger.js';

// pdf-parse v2 ships as ESM/CJS dual; using createRequire mirrors the proven
// pattern in scripts/ingest-resumes.ts and avoids ESM/CJS interop issues.
const require = createRequire(import.meta.url);

export interface PdfExtractResult {
  text: string;
  pages: number;
  charCount: number;
}

export class PdfService {
  // Reads a PDF buffer (from multer's memory storage) and returns its raw text.
  // pdf-parse v2 API: `new PDFParse({ data: buffer })` then `getText()`.
  static async extractText(buffer: Buffer, requestId?: string): Promise<PdfExtractResult> {
    let parser: any;
    try {
      const { PDFParse } = require('pdf-parse');
      parser = new PDFParse({ data: buffer });
      const res = await parser.getText();
      const text = String(res?.text ?? '');
      const pages = Number(res?.total ?? res?.pages?.length ?? 0) || 0;
      return { text, pages, charCount: text.length };
    } catch (err) {
      logger.error(
        { requestId, stage: 'pdf_extract', message: (err as Error)?.message, stack: (err as Error)?.stack },
        'PDF text extraction failed',
      );
      const e: any = new Error('Failed to extract text from the PDF');
      e.statusCode = 422;
      e.code = 'PDF_PARSE_FAILURE';
      throw e;
    } finally {
      // Release pdfjs document resources held by the parser instance.
      if (parser && typeof parser.destroy === 'function') {
        await parser.destroy().catch(() => {});
      }
    }
  }
}
