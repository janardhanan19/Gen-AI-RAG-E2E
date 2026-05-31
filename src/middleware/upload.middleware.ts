import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config/index.js';

const cfg = getConfig();
const maxBytes = cfg.MAX_UPLOAD_SIZE_MB * 1024 * 1024;

// Memory storage: the file buffer is held in RAM (req.file.buffer) so later
// pipeline steps (PDF parsing) can read it without touching disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      const err: any = new Error('Only PDF files are accepted');
      err.statusCode = 400;
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

const singleFile = upload.single('resume');

// Wraps multer so its errors are translated into the project's standard
// thrown-error shape ({ statusCode, code, message }) consumed by errorHandler.
export function uploadResume(req: Request, res: Response, next: NextFunction) {
  singleFile(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const mapped: any = new Error(err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        mapped.statusCode = 413;
        mapped.code = 'FILE_TOO_LARGE';
        mapped.message = `File exceeds the maximum size of ${cfg.MAX_UPLOAD_SIZE_MB} MB`;
      } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        mapped.statusCode = 400;
        mapped.code = 'INVALID_UPLOAD';
        mapped.message = 'Send exactly one file using the "resume" field';
      } else {
        mapped.statusCode = 400;
        mapped.code = 'UPLOAD_ERROR';
      }
      return next(mapped);
    }

    return next(err);
  });
}
