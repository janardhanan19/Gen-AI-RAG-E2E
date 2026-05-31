import { getConfig } from '../config/index.js';

type MistralEmbeddingResponse = {
  data?: Array<{ embedding: number[]; index?: number; object?: string }>;
  model?: string;
};

export class EmbeddingService {
  static async embed(input: string, modelOverride?: string): Promise<{ vector: number[]; model: string }> {
    const cfg = getConfig();
    const apiKey = cfg.MISTRAL_API_KEY;
    const model = (modelOverride || cfg.MISTRAL_EMBEDDING_MODEL || 'mistral-embed').replace(/"/g, '');

    if (!apiKey) {
      const err: any = new Error('Embedding provider not configured');
      err.statusCode = 500;
      err.code = 'EMBEDDING_CONFIG_MISSING';
      throw err;
    }

    const url = 'https://api.mistral.ai/v1/embeddings';
    const body = { model, input } as const;

    const res = await EmbeddingService.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err: any = new Error('Embedding provider error');
      err.statusCode = res.status >= 500 ? 502 : 400;
      err.code = 'EMBEDDING_PROVIDER_ERROR';
      err.details = { status: res.status, statusText: res.statusText, body: text ? '[redacted]' : undefined };
      throw err;
    }

    const json = (await res.json()) as MistralEmbeddingResponse;
    const vector = json?.data?.[0]?.embedding;
    if (!Array.isArray(vector)) {
      const err: any = new Error('Invalid embedding response');
      err.statusCode = 502;
      err.code = 'EMBEDDING_PARSE_ERROR';
      throw err;
    }

    return { vector, model };
  }

  private static async fetchWithRetry(url: string, init: RequestInit, attempts = 3, timeoutMs = 10_000): Promise<Response> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(id);
        if (res.status >= 500) {
          // retry on provider 5xx
          lastErr = new Error(`Upstream ${res.status}`);
        } else {
          return res;
        }
      } catch (err) {
        lastErr = err;
      } finally {
        // backoff with jitter between retries
        if (i < attempts - 1) {
          const delay = 200 * Math.pow(2, i) + Math.floor(Math.random() * 100);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr ?? new Error('Embedding request failed');
  }
}
