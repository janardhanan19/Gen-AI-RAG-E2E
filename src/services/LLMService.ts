import { getConfig } from '../config/index.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type RerankCandidate = { resumeId: string; snippet?: string; score?: number };
export type RerankItem = { resumeId: string; score: number; reason: string };

export type SummarizeCandidate = { resumeId: string; snippet?: string };
export type SummarizeStyle = 'short' | 'detailed';

type GroqChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export class LLMService {
  private static rerankPromptCache: string | null = null;
  private static summarizePromptCache: string | null = null;

  private static async loadPrompt(fileName: string): Promise<string> {
    const promptPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../prompts/templates',
      fileName
    );
    const buf = await readFile(promptPath);
    return buf.toString('utf8');
  }

  private static async loadRerankPrompt(): Promise<string> {
    if (this.rerankPromptCache) return this.rerankPromptCache;
    this.rerankPromptCache = await this.loadPrompt('rerank.prompt.txt');
    return this.rerankPromptCache;
  }

  private static async loadSummarizePrompt(): Promise<string> {
    if (this.summarizePromptCache) return this.summarizePromptCache;
    this.summarizePromptCache = await this.loadPrompt('summarize.prompt.txt');
    return this.summarizePromptCache;
  }

  static async rerankCandidates(params: {
    query: string;
    candidates: RerankCandidate[];
    topK?: number;
  }): Promise<{ ranked: RerankItem[]; llmMs: number }> {
    const { query, candidates, topK } = params;
    const cfg = getConfig();
    const apiKey = cfg.GROQ_API_KEY;
    const model = (cfg.GROQ_RERANK_MODEL || cfg.GROQ_MODEL || 'llama-3.1-8b-instant').replace(/"/g, '');

    if (!apiKey) {
      const err: any = new Error('LLM provider not configured');
      err.statusCode = 500;
      err.code = 'LLM_CONFIG_MISSING';
      throw err;
    }

    const systemPrompt = await this.loadRerankPrompt();

    // Keep payload compact: only pass what the model needs
    const compactCandidates = candidates.map((c, idx) => ({
      idx,
      resumeId: c.resumeId,
      snippet: c.snippet ?? ''
    }));

    const started = Date.now();
    const res = await this.fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: JSON.stringify({ query, candidates: compactCandidates, topK }),
          },
        ],
        // Ask for strict JSON if the provider supports it; safe to include
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err: any = new Error('LLM provider error');
      err.statusCode = res.status >= 500 ? 502 : 400;
      err.code = 'LLM_PROVIDER_ERROR';
      err.details = { status: res.status, statusText: res.statusText, body: text ? '[redacted]' : undefined };
      throw err;
    }

    const json = (await res.json()) as GroqChatResponse;
    const content = json?.choices?.[0]?.message?.content ?? '';

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const err: any = new Error('LLM JSON parse error');
      err.statusCode = 502;
      err.code = 'LLM_JSON_PARSE_ERROR';
      err.details = { content: content?.slice(0, 160) };
      throw err;
    }

    const rankedArr: any[] = Array.isArray(parsed?.ranked) ? parsed.ranked : [];
    // Validate & coerce minimal required fields
    const ranked: RerankItem[] = rankedArr
      .filter((r) => typeof r?.resumeId === 'string')
      .map((r) => ({
        resumeId: String(r.resumeId),
        score: typeof r.score === 'number' ? r.score : 0,
        reason: typeof r.reason === 'string' ? r.reason : '',
      }));

    // Respect topK if provided
    const finalRanked = typeof topK === 'number' ? ranked.slice(0, Math.max(0, topK)) : ranked;

    return { ranked: finalRanked, llmMs: Date.now() - started };
  }

  static async summarizeCandidateFit(params: {
    query: string;
    candidate: SummarizeCandidate;
    style?: SummarizeStyle;
    maxTokens?: number;
  }): Promise<{ summary: string; llmMs: number }> {
    const { query, candidate, style, maxTokens } = params;
    const cfg = getConfig();
    const apiKey = cfg.GROQ_API_KEY;
    const model = (cfg.GROQ_SUMMARIZE_MODEL || cfg.GROQ_MODEL || 'llama-3.1-8b-instant').replace(/"/g, '');

    if (!apiKey) {
      const err: any = new Error('LLM provider not configured');
      err.statusCode = 500;
      err.code = 'LLM_CONFIG_MISSING';
      throw err;
    }

    const systemPrompt = await this.loadSummarizePrompt();

    const compactCandidate = { resumeId: candidate.resumeId, snippet: candidate.snippet ?? '' };

    const requestBody: Record<string, any> = {
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ query, candidate: compactCandidate, style, maxTokens }) },
      ],
      response_format: { type: 'json_object' },
    };
    if (typeof maxTokens === 'number') requestBody.max_tokens = maxTokens;

    const started = Date.now();
    const res = await this.fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err: any = new Error('LLM provider error');
      err.statusCode = res.status >= 500 ? 502 : 400;
      err.code = 'LLM_PROVIDER_ERROR';
      err.details = { status: res.status, statusText: res.statusText, body: text ? '[redacted]' : undefined };
      throw err;
    }

    const json = (await res.json()) as GroqChatResponse;
    const content = json?.choices?.[0]?.message?.content ?? '';

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const err: any = new Error('LLM JSON parse error');
      err.statusCode = 502;
      err.code = 'LLM_JSON_PARSE_ERROR';
      err.details = { content: content?.slice(0, 160) };
      throw err;
    }

    const summary = typeof parsed?.summary === 'string' ? parsed.summary : '';

    return { summary, llmMs: Date.now() - started };
  }

  private static async fetchWithRetry(url: string, init: RequestInit, attempts = 3, timeoutMs = 20_000): Promise<Response> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(id);
        if (res.status >= 500) {
          lastErr = new Error(`Upstream ${res.status}`);
        } else {
          return res;
        }
      } catch (err) {
        lastErr = err;
      } finally {
        if (i < attempts - 1) {
          const delay = 200 * Math.pow(2, i) + Math.floor(Math.random() * 100);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr ?? new Error('LLM request failed');
  }
}
