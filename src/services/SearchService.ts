import { ResumeRepository } from '../repositories/ResumeRepository.js';
import { getConfig } from '../config/index.js';
import { LLMService, type SummarizeStyle } from './LLMService.js';

export type Candidate = { resumeId: string; snippet?: string; score?: number };
export type RankedCandidate = Candidate & { reason?: string; summary?: string };

function toStringId(id: any): string {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (id.$oid) return String(id.$oid);
  return String(id);
}

// Merge BM25 and vector candidates, deduplicating by resumeId. BM25 takes priority.
function mergeCandidates(bm25: Candidate[], vector: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const merged: Candidate[] = [];
  for (const c of [...bm25, ...vector]) {
    if (!c.resumeId || seen.has(c.resumeId)) continue;
    seen.add(c.resumeId);
    merged.push(c);
  }
  return merged;
}

function buildSnippet(doc: any): string | undefined {
  const hl = doc?.highlights?.[0]?.texts;
  if (Array.isArray(hl) && hl.length) {
    const text = hl.map((t: any) => t.value).join('');
    return text.slice(0, 240);
  }
  if (typeof doc?.experienceSummary === 'string' && doc.experienceSummary.length > 0) {
    return String(doc.experienceSummary).slice(0, 240);
  }
  if (typeof doc?.rawText === 'string' && doc.rawText.length > 0) {
    return String(doc.rawText).slice(0, 240);
  }
  return undefined;
}

export class SearchService {
  static async bm25Search(params: {
    query: string;
    topK?: number;
    filters?: { skills?: string[]; jobTitles?: string[]; location?: string; company?: string };
  }): Promise<{ results: Candidate[]; bm25Ms: number }> {
    const start = Date.now();

    // Build a safe $match from allowed filter fields only
    const match: Record<string, any> = {};
    if (params.filters?.skills?.length) match['skills'] = { $in: params.filters.skills };
    if (params.filters?.jobTitles?.length) match['jobTitles'] = { $in: params.filters.jobTitles };
    if (params.filters?.location) match['location'] = params.filters.location;
    if (params.filters?.company) match['company'] = params.filters.company;

    const docs = await ResumeRepository.bm25Search(params.query, {
      topK: params.topK,
      match: Object.keys(match).length ? match : undefined,
    });

    const results: Candidate[] = docs.map((d) => ({
      resumeId: toStringId(d._id),
      score: typeof d.score === 'number' ? d.score : undefined,
      snippet: buildSnippet(d),
    }));

    return { results, bm25Ms: Date.now() - start };
  }

  static async vectorSearch(params: {
    query: string;
    topK?: number;
    filters?: { skills?: string[]; jobTitles?: string[]; location?: string; company?: string };
  }): Promise<{ results: Candidate[]; embeddingMs: number; vectorMs: number }> {
    const embedStart = Date.now();
    // Lazy import to avoid circular deps; EmbeddingService has no deps on SearchService
    const { EmbeddingService } = await import('./EmbeddingService.js');
    const { vector } = await EmbeddingService.embed(params.query);
    const embeddingMs = Date.now() - embedStart;

    const match: Record<string, any> = {};
    if (params.filters?.skills?.length) match['skills'] = { $in: params.filters.skills };
    if (params.filters?.jobTitles?.length) match['jobTitles'] = { $in: params.filters.jobTitles };
    if (params.filters?.location) match['location'] = params.filters.location;
    if (params.filters?.company) match['company'] = params.filters.company;

    const vecStart = Date.now();
    const docs = await ResumeRepository.vectorSearch(vector, {
      topK: params.topK,
      match: Object.keys(match).length ? match : undefined,
    });
    const vectorMs = Date.now() - vecStart;

    const results: Candidate[] = docs.map((d) => ({
      resumeId: toStringId(d._id),
      score: typeof d.score === 'number' ? d.score : undefined,
      snippet: buildSnippet(d),
    }));

    return { results, embeddingMs, vectorMs };
  }

  static async hybridSearch(params: {
    query: string;
    topK?: number;
    filters?: { skills?: string[]; jobTitles?: string[]; location?: string; company?: string };
  }): Promise<{
    bm25: Candidate[];
    vector: Candidate[];
    componentTimings: { embeddingMs: number; bm25Ms: number; vectorMs: number; totalMs: number };
  }> {
    const totalStart = Date.now();
    const bm25Promise = this.bm25Search(params);
    const vectorPromise = this.vectorSearch(params); // handles its own embed

    const [bm25Res, vectorRes] = await Promise.all([bm25Promise, vectorPromise]);
    const totalMs = Date.now() - totalStart;

    return {
      bm25: bm25Res.results,
      vector: vectorRes.results,
      componentTimings: {
        embeddingMs: vectorRes.embeddingMs,
        bm25Ms: bm25Res.bm25Ms,
        vectorMs: vectorRes.vectorMs,
        totalMs,
      },
    };
  }

  static async endToEndSearch(params: {
    query: string;
    topK?: number;
    filters?: { skills?: string[]; jobTitles?: string[]; location?: string; company?: string };
    rerankTopN?: number;
    summarize?: boolean;
    summarizeTopK?: number;
    style?: SummarizeStyle;
    maxTokens?: number;
  }): Promise<{
    results: RankedCandidate[];
    fallbacks: { bm25Fallback: boolean; vectorFallback: boolean; rerankFallback: boolean };
    warnings: string[];
    componentTimings: {
      embeddingMs: number;
      bm25Ms: number;
      vectorMs: number;
      rerankMs: number;
      summarizeMs: number;
      totalMs: number;
    };
  }> {
    const totalStart = Date.now();
    const warnings: string[] = [];
    const fallbacks = { bm25Fallback: false, vectorFallback: false, rerankFallback: false };
    const searchParams = { query: params.query, topK: params.topK, filters: params.filters };

    // Run BM25 + vector in parallel; allSettled so one failure degrades gracefully
    const [bm25Settled, vectorSettled] = await Promise.allSettled([
      this.bm25Search(searchParams),
      this.vectorSearch(searchParams),
    ]);

    let bm25Results: Candidate[] = [];
    let vectorResults: Candidate[] = [];
    let bm25Ms = 0;
    let vectorMs = 0;
    let embeddingMs = 0;

    if (bm25Settled.status === 'fulfilled') {
      bm25Results = bm25Settled.value.results;
      bm25Ms = bm25Settled.value.bm25Ms;
    } else {
      fallbacks.bm25Fallback = true;
      warnings.push('BM25 search failed; using vector results only');
    }

    if (vectorSettled.status === 'fulfilled') {
      vectorResults = vectorSettled.value.results;
      vectorMs = vectorSettled.value.vectorMs;
      embeddingMs = vectorSettled.value.embeddingMs;
    } else {
      fallbacks.vectorFallback = true;
      warnings.push('Vector search failed; using BM25 results only');
    }

    if (bm25Settled.status === 'rejected' && vectorSettled.status === 'rejected') {
      const err: any = new Error('Both BM25 and vector search failed');
      err.statusCode = 502;
      err.code = 'SEARCH_FAILED';
      throw err;
    }

    const merged = mergeCandidates(bm25Results, vectorResults);
    const rerankTopN = params.rerankTopN ?? getConfig().RERANK_TOPN;
    const rerankInput = merged.slice(0, rerankTopN);

    // LLM re-ranking is the final authority; fall back to merged ordering on failure
    let ranked: RankedCandidate[] = rerankInput;
    let rerankMs = 0;
    try {
      const out = await LLMService.rerankCandidates({
        query: params.query,
        candidates: rerankInput.map((c) => ({ resumeId: c.resumeId, snippet: c.snippet, score: c.score })),
        topK: rerankTopN,
      });
      rerankMs = out.llmMs;
      const byId = new Map(rerankInput.map((c) => [c.resumeId, c]));
      ranked = out.ranked.map((r) => ({
        resumeId: r.resumeId,
        snippet: byId.get(r.resumeId)?.snippet,
        score: r.score,
        reason: r.reason,
      }));
    } catch {
      fallbacks.rerankFallback = true;
      warnings.push('LLM re-ranking failed; falling back to hybrid ordering (BM25 priority)');
    }

    const finalResults: RankedCandidate[] =
      typeof params.topK === 'number' ? ranked.slice(0, params.topK) : ranked;

    // Optional summarization of top-K (or all) final candidates; resilient per-candidate
    let summarizeMs = 0;
    if (params.summarize) {
      const sumStart = Date.now();
      const limit = typeof params.summarizeTopK === 'number' ? params.summarizeTopK : finalResults.length;
      const toSummarize = finalResults.slice(0, Math.max(0, limit));
      const settled = await Promise.allSettled(
        toSummarize.map((c) =>
          LLMService.summarizeCandidateFit({
            query: params.query,
            candidate: { resumeId: c.resumeId, snippet: c.snippet },
            style: params.style,
            maxTokens: params.maxTokens,
          })
        )
      );
      let anyFailed = false;
      settled.forEach((s, i) => {
        const target = toSummarize[i];
        if (s.status === 'fulfilled') {
          if (target) target.summary = s.value.summary;
        } else {
          anyFailed = true;
        }
      });
      if (anyFailed) warnings.push('Some summaries could not be generated');
      summarizeMs = Date.now() - sumStart;
    }

    return {
      results: finalResults,
      fallbacks,
      warnings,
      componentTimings: { embeddingMs, bm25Ms, vectorMs, rerankMs, summarizeMs, totalMs: Date.now() - totalStart },
    };
  }
}
