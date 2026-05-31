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
  rerankTopN: z.number().int().positive().max(50).optional(),
  summarize: z.boolean().optional(),
  summarizeTopK: z.number().int().positive().max(100).optional(),
  style: z.enum(['short', 'detailed']).optional(),
  maxTokens: z.number().int().positive().max(2000).optional(),
});

export const searchRouter = Router();

searchRouter.post('/', async (req, res, next) => {
  try {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err: any = new Error(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const { results, fallbacks, warnings, componentTimings } = await SearchService.endToEndSearch(parsed.data);

    res.json({ results, fallbacks, warnings, requestId: req.requestId, componentTimings });
  } catch (err) {
    next(err);
  }
});
