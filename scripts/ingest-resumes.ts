#!/usr/bin/env tsx
import 'dotenv/config';
import { stat, readdir, readFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
import { connectMongo } from '../src/lib/mongo.js';
import { getConfig } from '../src/config/index.js';

type Args = { dir: string; batch: number; concurrency: number; maxChars: number; limit?: number };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string, def?: string) => {
    const i = argv.findIndex((a) => a === flag);
    return i >= 0 ? argv[i + 1] : def;
  };
  const dir = get('--dir', '/Users/janardhanan/Downloads/Gen AI Int Apr 26/Resumes')!;
  const batch = Number(get('--batch', '20'));
  const concurrency = Number(get('--concurrency', '4'));
  const maxChars = Number(get('--maxChars', process.env.EMBEDDING_MAX_CHARS || '8000'));
  const limitStr = get('--limit');
  const limit = limitStr ? Number(limitStr) : undefined;
  if (!dir) throw new Error('Missing --dir <path>');
  return { dir, batch, concurrency, maxChars, limit };
}

async function listFilesRecursively(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(p: string) {
    const s = await stat(p);
    if (s.isDirectory()) {
      const entries = await readdir(p);
      for (const e of entries) await walk(join(p, e));
    } else if (s.isFile()) {
      out.push(p);
    }
  }
  await walk(dir);
  return out;
}

async function readResumeText(path: string): Promise<string> {
  const ext = extname(path).toLowerCase();
  if (ext === '.txt' || ext === '.md' || ext === '.json') {
    return await readFile(path, 'utf8');
  }
  if (ext === '.pdf') {
    try {
      const buf = await readFile(path);
      // Use CommonJS require to avoid ESM/CJS interop issues
      const { PDFParse } = require('pdf-parse');
      // pdf-parse v2 usage: instantiate class and call getText()
      const parser = new PDFParse({ data: buf });
      const res = await parser.getText();
      return String(res?.text || '');
    } catch (err) {
      console.warn(`PDF parse failed for ${path}: ${String((err as Error).message || err)}`);
      return '';
    }
  }
  if (ext === '.docx') {
    try {
      // Use CommonJS require to avoid ESM/CJS interop issues
      const mammoth: any = require('mammoth');
      const res = await mammoth.extractRawText({ path });
      return String(res?.value || '');
    } catch (err) {
      console.warn(`DOCX parse failed for ${path}: ${String((err as Error).message || err)}`);
      return '';
    }
  }
  return '';
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function postEmbedding(baseUrl: string, input: string): Promise<number[]> {
  const resp = await fetch(`${baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Embeddings endpoint failed: ${resp.status} ${resp.statusText} ${t}`);
  }
  const json = (await resp.json()) as { embedding: number[] };
  if (!Array.isArray(json.embedding)) throw new Error('Invalid embedding response');
  return json.embedding;
}

function computeResumeId(text: string): string {
  // Normalize whitespace for stability, then hash
  const normalized = text.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex');
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length) as any;
  let i = 0;
  let active = 0;
  return await new Promise((resolve, reject) => {
    const next = () => {
      if (i >= items.length && active === 0) return resolve(results);
      while (active < limit && i < items.length) {
        const idx = i++;
        active++;
        const it = items[idx] as T; // bounded by loop conditions
        fn(it, idx)
          .then((r) => (results[idx] = r))
          .catch(reject)
          .finally(() => {
            active--;
            next();
          });
      }
    };
    next();
  });
}

async function main() {
  const { dir, batch, concurrency, maxChars, limit } = parseArgs();
  const cfg = getConfig();
  const baseUrl = `http://localhost:${cfg.PORT}`;

  let allFiles = (await listFilesRecursively(dir)).filter((p) => ['.txt', '.md', '.json', '.pdf', '.docx'].includes(extname(p).toLowerCase()));
  if (limit && Number.isFinite(limit) && limit > 0) {
    allFiles = allFiles.slice(0, limit);
    console.log(`Found files under ${dir}, limiting to first ${allFiles.length} by --limit=${limit}`);
  } else {
    console.log(`Found ${allFiles.length} files under ${dir}`);
  }

  const db = await connectMongo();
  const collectionName = (process.env.RESUMES_COLLECTION || 'resumes').replace(/"/g, '');
  const col = db.collection(collectionName);

  let processed = 0;
  let skipped = 0;
  const batches = chunk(allFiles, batch);
  for (let b = 0; b < batches.length; b++) {
    const files = batches[b]!;
    console.log(`Batch ${b + 1}/${batches.length} — files: ${files.length}`);

    await mapWithConcurrency(files, concurrency, async (file) => {
      const textRaw = await readResumeText(file);
      const text = textRaw?.slice(0, maxChars) || '';
      if (!text.trim()) {
        skipped++;
        console.warn(`Skipping (no text): ${file}`);
        return;
      }
      const vector = await postEmbedding(baseUrl, text);
      const resumeId = computeResumeId(text);
      const doc = {
        resumeId,
        latestSourcePath: file,
        name: basename(file),
        rawText: text,
        embedding: vector,
        updatedAt: new Date(),
      } as const;
      await col.updateOne(
        { resumeId },
        {
          $set: doc,
          $setOnInsert: { createdAt: new Date() },
          $addToSet: { sources: file },
        },
        { upsert: true }
      );
      processed++;
    });
  }
  console.log(`Done. Processed: ${processed}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
