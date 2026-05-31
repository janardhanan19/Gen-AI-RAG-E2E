import { EmbeddingService } from '../EmbeddingService.js';
import { getConfig } from '../../config/index.js';
import type { ParsedResume } from '../../modules/ingestion/ingestion.types.js';

// Phase 5 — Embedding Generation (Step 6 in the architecture doc).
//
// This service owns the ingestion-specific concern: turning a ParsedResume
// into the concise input string described in the doc's "Embedding Flow"
// (skills + experience titles/companies + education degrees — NOT rawText,
// which is too long and noisy). The actual Mistral /v1/embeddings call,
// including timeout, retry-with-backoff, and config loading, is delegated to
// the existing production EmbeddingService to avoid duplicating the client.

export interface IngestionEmbeddingResult {
  // The full 1024-dim vector, carried forward to the storage phase.
  vector: number[];
  // The model that produced the vector (e.g. "mistral-embed").
  model: string;
  // The number of dimensions in the vector; logged and surfaced in responses.
  dimensions: number;
  // The exact input string sent to the embedding provider.
  input: string;
}

export class IngestionEmbeddingService {
  // Generate an embedding for a parsed resume. Builds the input string from
  // representative fields, then delegates the API call to EmbeddingService.
  static async generate(parsed: ParsedResume): Promise<IngestionEmbeddingResult> {
    const input = IngestionEmbeddingService.buildEmbeddingInput(parsed);

    if (!input) {
      const err: any = new Error('No representative fields to embed');
      err.statusCode = 422;
      err.code = 'EMBEDDING_INPUT_EMPTY';
      throw err;
    }

    const { vector, model } = await EmbeddingService.embed(input);

    // Layer 2 — hard check (doc section 8): the vector must be exactly the
    // configured length, otherwise the Atlas vector index would reject it and
    // the document would be silently unsearchable. This is a hard failure.
    const expected = getConfig().MISTRAL_EMBEDDING_DIMENSIONS;
    if (vector.length !== expected) {
      const err: any = new Error(
        `Embedding dimension mismatch: expected ${expected}, got ${vector.length}`,
      );
      err.statusCode = 500;
      err.code = 'EMBEDDING_DIMENSION_MISMATCH';
      throw err;
    }

    return { vector, model, dimensions: vector.length, input };
  }

  // Combine the most search-relevant parsed fields into a single concise,
  // representative string. Order: skills, then experience titles/companies,
  // then education degrees. rawText is intentionally excluded.
  static buildEmbeddingInput(parsed: ParsedResume): string {
    const parts: string[] = [];

    if (parsed.skills.length > 0) {
      parts.push(`Skills: ${parsed.skills.join(', ')}`);
    }

    const experienceParts = parsed.experience
      .map((entry) => [entry.title, entry.company].filter(Boolean).join(' at '))
      .filter((line) => line.length > 0);
    if (experienceParts.length > 0) {
      parts.push(`Experience: ${experienceParts.join('; ')}`);
    }

    const degrees = parsed.education
      .map((entry) => entry.degree)
      .filter((degree) => degree.length > 0);
    if (degrees.length > 0) {
      parts.push(`Education: ${degrees.join(', ')}`);
    }

    return parts.join('\n').trim();
  }
}
