/**
 * fix-username-index.js
 *
 * Fixes: E11000 duplicate key error ... index: username_1 dup key: { username: null }
 *
 * Cause: an old version of the Parent schema had a unique `username` field.
 * That unique index (`username_1`) still exists on the `parents` collection
 * even though the current schema no longer has a `username` field. Every
 * new parent document therefore gets `username: null`, and MongoDB's unique
 * index rejects the second (and every subsequent) `null` value.
 *
 * This script connects to your database, checks whether the stale
 * `username_1` index exists on the `parents` collection, and drops it if so.
 * It does NOT touch your documents or any other indexes (email_1,
 * mobile_number_1, etc. are left alone).
 *
 * Usage:
 *   npm install mongodb   # if not already installed
 *
 *   # If your URI already includes the db name:
 *   node fix-username-index.js "mongodb://host:27017/myDb"
 *
 *   # Otherwise pass the db name explicitly as a 2nd argument:
 *   node fix-username-index.js "mongodb://host:27017" "myDatabaseName"
 *
 * Or set an env var instead of passing an argument:
 *   MONGODB_URI="mongodb://host:27017/myDb" node fix-username-index.js
 */

const { MongoClient } = require('mongodb');

const args = process.argv.slice(2);

const uri =
  args[0] ||
  process.env.MONGODB_URI ||
  'mongodb+srv://playschool503_db_user:lnadfJYNjZofhxxN@cluster0.y7a98ry.mongodb.net/?appName=Cluster0';
const dbName = args[1] || process.env.MONGO_DB; // optional — falls back to the db in the URI

const COLLECTION = 'parents';
const INDEX_NAME = 'username_1';

if (!uri) {
  console.error('Missing connection info.');
  console.error('Usage: node fix-username-index.js "<mongo-uri>" ["<database-name>"]');
  process.exit(1);
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
    console.log(`Collection: ${COLLECTION}\n`);

    const collections = await db.listCollections({ name: COLLECTION }).toArray();
    if (collections.length === 0) {
      console.log(`Collection "${COLLECTION}" does not exist. Nothing to do.`);
      return;
    }

    const indexes = await db.collection(COLLECTION).indexes();
    console.log('Current indexes:');
    indexes.forEach((idx) => {
      console.log(`  - ${idx.name}  key: ${JSON.stringify(idx.key)}  unique: ${!!idx.unique}`);
    });

    const staleIndex = indexes.find((idx) => idx.name === INDEX_NAME);

    if (!staleIndex) {
      console.log(`\nNo "${INDEX_NAME}" index found. Nothing to drop — you're already clean.`);
      return;
    }

    console.log(`\nFound stale index "${INDEX_NAME}". Dropping it...`);
    await db.collection(COLLECTION).dropIndex(INDEX_NAME);
    console.log(`Dropped "${INDEX_NAME}" successfully.`);

    const remaining = await db.collection(COLLECTION).indexes();
    console.log('\nRemaining indexes:');
    remaining.forEach((idx) => {
      console.log(`  - ${idx.name}  key: ${JSON.stringify(idx.key)}  unique: ${!!idx.unique}`);
    });

    console.log('\nDone. You should now be able to create parents without the duplicate key error.');
  } catch (err) {
    console.error('Error while fixing index:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();