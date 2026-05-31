import { Router } from 'express';
import { z } from 'zod';
import { EmbeddingService } from '../../services/EmbeddingService.js';

const BodySchema = z.object({
  input: z.string().min(1, 'input is required'),
  model: z.string().optional(),
});

export const embeddingsRouter = Router();

embeddingsRouter.post('/', async (req, res, next) => {
  const started = Date.now();
  try {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err: any = new Error(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const { input, model } = parsed.data;
    const { vector, model: usedModel } = await EmbeddingService.embed(input, model);
    const ms = Date.now() - started;
    res.json({ embedding: vector, model: usedModel, requestId: req.requestId, embeddingMs: ms });
  } catch (err) {
    next(err);
  }
});
