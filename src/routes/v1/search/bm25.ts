import { Router } from 'express';
import { z } from 'zod';
import { SearchService } from '../../../services/SearchService.js';

const BodySchema = z.object({
  query: z.string().min(1, 'query is required'),
  topK: z.number().int().positive().max(100).optional(),
  filters: z
    .object({
      skills: z.array(z.string()).optional(),
      jobTitles: z.array(z.string()).optional(),
      location: z.string().optional(),
      company: z.string().optional(),
    })
    .optional(),
});

export const bm25Router = Router();

bm25Router.post('/', async (req, res, next) => {
  const started = Date.now();
  try {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err: any = new Error(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const { query, topK, filters } = parsed.data;
    const { results, bm25Ms } = await SearchService.bm25Search({ query, topK, filters });
    res.json({ results, requestId: req.requestId, bm25Ms, componentTimings: { bm25Ms, totalMs: Date.now() - started } });
  } catch (err) {
    next(err);
  }
});
