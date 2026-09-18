/**
 * clear-db-data.js
 *
 * Deletes ALL DOCUMENTS from EVERY COLLECTION in a MongoDB database,
 * WITHOUT dropping the collections themselves (indexes, validators,
 * and collection options are preserved).
 *
 * Usage:
 *   npm install mongodb        # if not already installed
 *
 *   # If your URI already includes the db name (e.g. mongodb://host:27017/myDb):
 *   node clear-db-data.js "mongodb://host:27017/myDb"
 *
 *   # Otherwise, pass the db name explicitly as a 2nd argument:
 *   node clear-db-data.js "mongodb://host:27017" "myDatabaseName"
 *
 * Or set env vars instead of passing args:
 *   MONGO_URI="mongodb://host:27017/myDb" node clear-db-data.js
 *
 * Safety:
 *   - Prompts for confirmation before deleting anything.
 *   - Pass --yes as an extra arg to skip the confirmation prompt (e.g. for CI/scripts).
 */

const { MongoClient } = require('mongodb');
const readline = require('readline');

const args = process.argv.slice(2).filter((a) => a !== '--yes');
const skipConfirm = process.argv.includes('--yes');

const uri = args[0] || process.env.MONGODB_URI || "mongodb+srv://playschool503_db_user:lnadfJYNjZofhxxN@cluster0.y7a98ry.mongodb.net/?appName=Cluster0";
const dbName = args[1] || process.env.MONGO_DB; // optional — falls back to the db in the URI

if (!uri) {
  console.error('Missing connection info.');
  console.error('Usage: node clear-db-data.js "<mongo-uri>" ["<database-name>"] [--yes]');
  console.error('(If <database-name> is omitted, the db from the URI\'s path is used.)');
  process.exit(1);
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db(); // no name -> uses db from the URI

    if (!db.databaseName) {
      console.error(
        'Could not determine a database name. Either include it in the URI path (mongodb://host:27017/myDb) or pass it as a 2nd argument.'
      );
      process.exit(1);
    }

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();

    if (collections.length === 0) {
      console.log(`No collections found in database "${db.databaseName}". Nothing to do.`);
      return;
    }

    console.log(`Database: ${db.databaseName}`);
    console.log(`Collections found (${collections.length}):`);
    collections.forEach((c) => console.log(`  - ${c.name}`));

    if (!skipConfirm) {
      const ok = await confirm(
        `\nThis will DELETE ALL DOCUMENTS in the above collections (collections themselves will stay). Type "yes" to continue: `
      );
      if (!ok) {
        console.log('Aborted. No changes made.');
        return;
      }
    }

    for (const { name } of collections) {
      // Skip system collections just in case
      if (name.startsWith('system.')) continue;

      const result = await db.collection(name).deleteMany({});
      console.log(`Cleared "${name}": ${result.deletedCount} document(s) deleted.`);
    }

    console.log('\nDone. All collections still exist, now empty.');
  } catch (err) {
    console.error('Error while clearing database:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();