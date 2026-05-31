import { Router } from 'express';
import { z } from 'zod';
import { LLMService } from '../../../services/LLMService.js';

const CandidateSchema = z.object({
  resumeId: z.string().min(1),
  snippet: z.string().optional(),
  score: z.number().optional(),
});

const BodySchema = z.object({
  query: z.string().min(1),
  candidates: z.array(CandidateSchema).min(1),
  topK: z.number().int().positive().max(100).optional(),
});

export const rerankRouter = Router();

rerankRouter.post('/', async (req, res, next) => {
  const started = Date.now();
  try {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err: any = new Error(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const { query, candidates, topK } = parsed.data;

    const { ranked, llmMs } = await LLMService.rerankCandidates({ query, candidates, topK });
    res.json({ ranked, requestId: req.requestId, componentTimings: { llmMs, totalMs: Date.now() - started } });
  } catch (err) {
    next(err);
  }
});
