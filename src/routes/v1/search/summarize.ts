import { Router } from 'express';
import { z } from 'zod';
import { LLMService } from '../../../services/LLMService.js';

const CandidateSchema = z.object({
  resumeId: z.string().min(1),
  snippet: z.string().optional(),
});

const BodySchema = z.object({
  query: z.string().min(1),
  candidate: CandidateSchema,
  style: z.enum(['short', 'detailed']).optional(),
  maxTokens: z.number().int().positive().max(2000).optional(),
});

export const summarizeRouter = Router();

summarizeRouter.post('/', async (req, res, next) => {
  const started = Date.now();
  try {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err: any = new Error(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const { query, candidate, style, maxTokens } = parsed.data;

    const { summary, llmMs } = await LLMService.summarizeCandidateFit({ query, candidate, style, maxTokens });
    res.json({ summary, requestId: req.requestId, componentTimings: { llmMs, totalMs: Date.now() - started } });
  } catch (err) {
    next(err);
  }
});
