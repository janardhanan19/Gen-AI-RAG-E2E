import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI!;
  const dbName = process.env.MONGODB_DB ?? process.env.DB_NAME!;
  const collectionName = (process.env.RESUMES_COLLECTION || 'resumes').replace(/"/g, '');
  const indexName = (process.env.ATLAS_SEARCH_INDEX_BM25 || 'BM25_index').replace(/"/g, '');

  const client = new MongoClient(uri, { monitorCommands: false });
  await client.connect();
  const db = client.db(dbName);
  const coll = db.collection(collectionName);

  console.log('DB:', dbName, 'Collection:', collectionName, 'Index:', indexName);
  console.log('Doc count:', await coll.estimatedDocumentCount());
  const sample = await coll.findOne({});
  console.log('DOCKEYS=' + (sample ? Object.keys(sample).join(',') : 'none'));

  try {
    const idx = await coll.listSearchIndexes().toArray();
    for (const i of idx) {
      console.log('INDEX_NAME=' + i.name + ' STATUS=' + i.status + ' TYPE=' + (i.type ?? 'search'));
      console.log('INDEX_DEF=' + JSON.stringify(i.latestDefinition ?? i.definition ?? {}));
    }
  } catch (e: any) {
    console.log('listSearchIndexes failed:', e?.message);
  }

  const pipeline: any[] = [
    {
      $search: {
        index: indexName,
        text: {
          query: 'Senior',
          path: ['rawText', 'skills'],
          fuzzy: { maxEdits: 1, prefixLength: 2 },
        },
        highlight: { path: ['rawText'] },
      },
    },
    { $limit: 3 },
  ];

  try {
    const docs = await coll.aggregate(pipeline, { allowDiskUse: false }).toArray();
    console.log('Pipeline OK, docs:', docs.length);
  } catch (err: any) {
    console.log('--- PIPELINE FAILED ---');
    console.log('name:', err?.name);
    console.log('code:', err?.code);
    console.log('codeName:', err?.codeName);
    console.log('message:', err?.message);
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
