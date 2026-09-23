/**
 * fix-stale-indexes.js
 *
 * The username_1 problem wasn't specific to the `parents` collection — it
 * happens whenever a schema field is removed/renamed but the old unique
 * index built for it is never dropped. Mongo keeps the index around
 * forever until you explicitly drop it, even if every document in the
 * collection is deleted and recreated.
 *
 * This script has two modes:
 *
 *   1) AUDIT (default, safe, read-only)
 *      Scans every collection in the database, lists every index, and
 *      flags any UNIQUE index where a sample of documents shows the
 *      indexed field missing/null on some or all of them — that's the
 *      signature of a stale index left over from an old schema (exactly
 *      like username_1 on parents).
 *
 *   2) FIX (only drops what you explicitly approve)
 *      Reads a small config array at the top of this file — a list of
 *      { collection, index } pairs — and drops exactly those indexes.
 *      Nothing is dropped unless you list it there, so there's no risk of
 *      accidentally removing an index you still need.
 *
 * Usage:
 *   npm install mongodb   # if not already installed
 *
 *   # Just audit (safe, no changes made):
 *   node fix-stale-indexes.js "mongodb://host:27017/myDb"
 *
 *   # Audit + drop everything listed in STALE_INDEXES_TO_DROP below:
 *   node fix-stale-indexes.js "mongodb://host:27017/myDb" --fix
 *
 *   # If your URI has no db name in the path:
 *   node fix-stale-indexes.js "mongodb://host:27017" "myDatabaseName" --fix
 *
 * Or set env vars instead of passing the URI:
 *   MONGODB_URI="mongodb://host:27017/myDb" node fix-stale-indexes.js --fix
 */

const { MongoClient } = require('mongodb');

// ─────────────────────────────────────────────────────────────────────────
// EDIT THIS LIST before running with --fix.
// Add every stale index you've confirmed from the AUDIT output.
// Example (this is exactly what fixed the parents collection earlier):
//
//   { collection: 'parents', index: 'username_1' },
//
// Leave it empty and the --fix run will do nothing.
// ─────────────────────────────────────────────────────────────────────────
const STALE_INDEXES_TO_DROP = [
  { collection: 'parents', index: 'username_1' },
  // { collection: 'students', index: 'roll_no_1' },
  // { collection: 'teachers', index: 'staffId_1' },
];

const args = process.argv.slice(2).filter((a) => a !== '--fix');
const shouldFix = process.argv.includes('--fix');

const uri =
  args[0] ||
  process.env.MONGODB_URI ||
  'mongodb+srv://playschool503_db_user:lnadfJYNjZofhxxN@cluster0.y7a98ry.mongodb.net/?appName=Cluster0';
const dbName = args[1] || process.env.MONGO_DB; // optional — falls back to the db in the URI

const SAMPLE_SIZE = 200; // how many docs to sample per collection when auditing

if (!uri) {
  console.error('Missing connection info.');
  console.error('Usage: node fix-stale-indexes.js "<mongo-uri>" ["<database-name>"] [--fix]');
  process.exit(1);
}

// Returns, for a single unique index, how many sampled docs are missing
// (or have null for) EVERY field in that index's key.
async function countNullish(db, collectionName, indexKey) {
  const fields = Object.keys(indexKey);
  const matchStage = {
    $or: fields.map((f) => ({ $or: [{ [f]: null }, { [f]: { $exists: false } }] })),
  };

  const sample = await db
    .collection(collectionName)
    .aggregate([{ $sample: { size: SAMPLE_SIZE } }, { $match: matchStage }, { $count: 'nullish' }])
    .toArray();

  return sample[0]?.nullish || 0;
}

async function auditCollection(db, collectionName) {
  const indexes = await db.collection(collectionName).indexes();
  const totalDocs = await db.collection(collectionName).estimatedDocumentCount();

  console.log(`\n── ${collectionName} (${totalDocs} docs) ──`);

  if (indexes.length <= 1) {
    console.log('  (only the default _id index — nothing to check)');
    return [];
  }

  const flagged = [];

  for (const idx of indexes) {
    if (idx.name === '_id_') continue;

    const uniqueTag = idx.unique ? ' [unique]' : '';
    let line = `  - ${idx.name}  key: ${JSON.stringify(idx.key)}${uniqueTag}`;

    if (idx.unique && totalDocs > 0) {
      const nullishCount = await countNullish(db, collectionName, idx.key);
      if (nullishCount > 0) {
        line += `  ⚠️  ${nullishCount}/${Math.min(totalDocs, SAMPLE_SIZE)} sampled docs missing this field — likely STALE`;
        flagged.push({ collection: collectionName, index: idx.name, key: idx.key });
      }
    }

    console.log(line);
  }

  return flagged;
}

async function main() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();

    if (!db.databaseName) {
      console.error(
        'Could not determine a database name. Either include it in the URI path (mongodb://host:27017/myDb) or pass it as a 2nd argument.'
      );
      process.exit(1);
    }

    console.log(`Database: ${db.databaseName}`);
    console.log(`Mode: ${shouldFix ? 'AUDIT + FIX' : 'AUDIT ONLY (pass --fix to apply drops)'}`);

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const userCollections = collections.filter((c) => !c.name.startsWith('system.'));

    if (userCollections.length === 0) {
      console.log('No collections found. Nothing to do.');
      return;
    }

    let allFlagged = [];
    for (const { name } of userCollections) {
      const flagged = await auditCollection(db, name);
      allFlagged = allFlagged.concat(flagged);
    }

    console.log('\n─────────────────────────────────────────');
    if (allFlagged.length === 0) {
      console.log('No unique indexes with missing-field documents were found.');
    } else {
      console.log('Indexes flagged as likely stale (unique index, but field missing on sampled docs):');
      allFlagged.forEach((f) => console.log(`  { collection: '${f.collection}', index: '${f.index}' },`));
      console.log('\nCopy any of these you want removed into STALE_INDEXES_TO_DROP at the top of this');
      console.log('file, then re-run with --fix. (parents/username_1 is already in the list.)');
    }

    if (!shouldFix) {
      console.log('\nRun again with --fix to drop everything currently listed in STALE_INDEXES_TO_DROP.');
      return;
    }

    console.log('\n─────────────────────────────────────────');
    console.log('Applying fixes from STALE_INDEXES_TO_DROP...\n');

    if (STALE_INDEXES_TO_DROP.length === 0) {
      console.log('STALE_INDEXES_TO_DROP is empty — nothing to drop.');
      return;
    }

    for (const { collection, index } of STALE_INDEXES_TO_DROP) {
      const exists = collections.some((c) => c.name === collection);
      if (!exists) {
        console.log(`  Skipping ${collection}.${index} — collection "${collection}" not found.`);
        continue;
      }

      const indexes = await db.collection(collection).indexes();
      const found = indexes.find((i) => i.name === index);

      if (!found) {
        console.log(`  Skipping ${collection}.${index} — index not found (already dropped?).`);
        continue;
      }

      await db.collection(collection).dropIndex(index);
      console.log(`  ✅ Dropped ${collection}.${index}`);
    }

    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();