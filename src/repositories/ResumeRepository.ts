import { connectMongo } from '../lib/mongo.js';
import type { ExperienceEntry, EducationEntry } from '../modules/ingestion/ingestion.types.js';

export type ResumeDoc = {
  _id: string | { $oid: string };
  name?: string;
  experienceSummary?: string;
  rawText?: string;
  skills?: string[];
  jobTitles?: string[];
  // meta from $search
  score?: number;
  highlights?: any;
};

// Phase 6 — the document shape inserted by the ingestion pipeline. Mirrors the
// `resumes` collection structure in resume-ingestion-architecture.md (section 6):
// metadata + parsed fields + rawText + the 1024-dim Mistral embedding.
export type ResumeInsert = {
  // Metadata
  uploadedAt: Date;
  source: 'upload';
  status: 'active';
  // Contact
  name: string;
  email: string;
  phone: string;
  // Parsed fields
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  // Raw text (kept for debugging/reprocessing)
  rawText: string;
  // Embedding (1024 floats from Mistral)
  embedding: number[];
};

export class ResumeRepository {
  static async bm25Search(query: string, opts?: { topK?: number; match?: Record<string, unknown> }): Promise<ResumeDoc[]> {
    const db = await connectMongo();
    const collectionName = (process.env.RESUMES_COLLECTION || 'resumes').replace(/"/g, '');
    const indexName = (process.env.ATLAS_SEARCH_INDEX_BM25 || 'BM25_index').replace(/"/g, '');
    const topK = Math.min(Math.max(opts?.topK ?? 20, 1), 100);

    const pipeline: any[] = [
      {
        $search: {
          index: indexName,
          text: {
            query,
            path: ['rawText', 'skills'],
            fuzzy: { maxEdits: 1, prefixLength: 2 },
          },
          highlight: { path: ['rawText'] },
        },
      },
    ];

    if (opts?.match && Object.keys(opts.match).length > 0) {
      pipeline.push({ $match: opts.match });
    }

    pipeline.push(
      {
        $project: {
          name: 1,
          rawText: 1,
          skills: 1,
          score: { $meta: 'searchScore' },
          highlights: { $meta: 'searchHighlights' },
        },
      },
      { $limit: topK }
    );

    try {
      const cursor = db.collection(collectionName).aggregate(pipeline, { allowDiskUse: false });
      const docs = (await cursor.toArray()) as ResumeDoc[];
      return docs;
    } catch (err: any) {
      const e: any = new Error('Atlas Search BM25 query failed');
      e.statusCode = 503;
      e.code = 'ATLAS_SEARCH_ERROR';
      e.cause = err;
      throw e;
    }
  }

  static async vectorSearch(
    queryVector: number[],
    opts?: { topK?: number; numCandidates?: number; match?: Record<string, unknown> }
  ): Promise<ResumeDoc[]> {
    const db = await connectMongo();
    const collectionName = (process.env.RESUMES_COLLECTION || 'resumes').replace(/\"/g, '');
    const indexName = (process.env.ATLAS_SEARCH_INDEX_VECTOR || 'vector_index').replace(/\"/g, '');
    const topK = Math.min(Math.max(opts?.topK ?? 20, 1), 100);
    const numCandidates = Math.min(Math.max(opts?.numCandidates ?? topK * 50, 10), 2000);

    const vectorStage: any = {
      $vectorSearch: {
        index: indexName,
        path: 'embedding',
        queryVector,
        numCandidates,
        limit: topK,
      },
    };
    if (opts?.match && Object.keys(opts.match).length > 0) {
      // Use filter inside $vectorSearch when provided
      vectorStage.$vectorSearch.filter = opts.match;
    }

    const pipeline: any[] = [
      vectorStage,
      {
        $project: {
          name: 1,
          experienceSummary: 1,
          rawText: 1,
          skills: 1,
          jobTitles: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    try {
      const cursor = db.collection(collectionName).aggregate(pipeline, { allowDiskUse: false });
      const docs = (await cursor.toArray()) as ResumeDoc[];
      return docs;
    } catch (err: any) {
      const e: any = new Error('Atlas Vector Search query failed');
      e.statusCode = 503;
      e.code = 'ATLAS_VECTOR_SEARCH_ERROR';
      e.cause = err;
      throw e;
    }
  }

  // Phase 6 — Store. Inserts a single assembled resume document into the
  // `resumes` collection and returns the new _id as a string.
  static async insertResume(doc: ResumeInsert): Promise<string> {
    const db = await connectMongo();
    const collectionName = (process.env.RESUMES_COLLECTION || 'resumes').replace(/"/g, '');

    try {
      const result = await db.collection(collectionName).insertOne(doc);
      return result.insertedId.toString();
    } catch (err: any) {
      const e: any = new Error('Failed to store resume document');
      e.statusCode = 503;
      e.code = 'RESUME_INSERT_ERROR';
      e.cause = err;
      throw e;
    }
  }
}
