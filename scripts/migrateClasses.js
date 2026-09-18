/**
 * Migration Script: Rename Title Case class names to new scheme
 * ------------------------------------------------------------
 * Old → New
 *   Toddler      → Playgroup
 *   Pre-Nursery  → Nursery
 *   Nursery      → LKG
 *   KG-1         → UKG
 *
 * Affected collections / fields:
 *   - faculties       → class_mappings[].class_name
 *                       substitute_assignments[].class_name
 *                       preferences.substitute_preferences.preferred_classes[]
 *                       assigned_class (if stored as Title Case)
 *   - leaverequests   → assigned_class
 *   - holidays        → affected_classes[]
 *
 * Usage:
 *   node scripts/migrate-titlecase-class-names.js
 *   node scripts/migrate-titlecase-class-names.js --dry-run   (preview only)
 *
 * Requires:
 *   - MONGODB_URI (or MONGO_URI / DATABASE_URL) in .env
 *   - mongoose installed
 */

require('dotenv').config();
const mongoose = require('mongoose');

// ==================== CONFIG ====================
const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env.DATABASE_URL ||
  'mongodb+srv://playschool503_db_user:lnadfJYNjZofhxxN@cluster0.y7a98ry.mongodb.net/?appName=Cluster0';

const DRY_RUN = process.argv.includes('--dry-run');

// Old → New  (Title Case)
const NAME_MAP = {
  'Toddler':     'Playgroup',
  'Pre-Nursery': 'Nursery',
  'Nursery':     'LKG',
  'KG-1':        'UKG',
};

// ==================== HELPERS ====================
const log = (...args) => console.log('🔹', ...args);
const ok  = (...args) => console.log('✅', ...args);
const err = (...args) => console.error('❌', ...args);

/**
 * Migrate a plain string field using a two-pass temp rename.
 * Pass 1: old → __tmp_old
 * Pass 2: __tmp_old → new
 * This is safe even when new values collide with old values.
 */
async function migrateStringField(collection, field, mapping) {
  const entries = Object.entries(mapping);
  let touched = 0;

  // ---- Pass 1 ----
  for (const [oldVal] of entries) {
    const tmpVal = `__tmp_${oldVal}`;
    const filter = { [field]: oldVal };
    const count = await collection.countDocuments(filter);
    if (count === 0) continue;

    log(`[${collection.collectionName}] ${field}: "${oldVal}" → "${tmpVal}" (${count})`);
    if (!DRY_RUN) await collection.updateMany(filter, { $set: { [field]: tmpVal } });
    touched += count;
  }

  // ---- Pass 2 ----
  for (const [oldVal, newVal] of entries) {
    const tmpVal = `__tmp_${oldVal}`;
    const filter = { [field]: tmpVal };
    const count = await collection.countDocuments(filter);
    if (count === 0) continue;

    log(`[${collection.collectionName}] ${field}: "${tmpVal}" → "${newVal}" (${count})`);
    if (!DRY_RUN) await collection.updateMany(filter, { $set: { [field]: newVal } });
  }

  return touched;
}

/**
 * Migrate an array-of-strings field using arrayFilters with two passes.
 * e.g. holidays.affected_classes, faculty.preferences...preferred_classes
 */
async function migrateStringArrayField(collection, field, mapping) {
  const entries = Object.entries(mapping);
  let touched = 0;

  // ---- Pass 1 ----
  for (const [oldVal] of entries) {
    const tmpVal = `__tmp_${oldVal}`;
    const filter = { [field]: oldVal };
    const count = await collection.countDocuments(filter);
    if (count === 0) continue;

    log(`[${collection.collectionName}] ${field}[]: "${oldVal}" → "${tmpVal}" (${count})`);
    if (!DRY_RUN) {
      await collection.updateMany(
        filter,
        { $set: { [`${field}.$[e]`]: tmpVal } },
        { arrayFilters: [{ 'e': oldVal }] }
      );
    }
    touched += count;
  }

  // ---- Pass 2 ----
  for (const [oldVal, newVal] of entries) {
    const tmpVal = `__tmp_${oldVal}`;
    const filter = { [field]: tmpVal };
    const count = await collection.countDocuments(filter);
    if (count === 0) continue;

    log(`[${collection.collectionName}] ${field}[]: "${tmpVal}" → "${newVal}" (${count})`);
    if (!DRY_RUN) {
      await collection.updateMany(
        filter,
        { $set: { [`${field}.$[e]`]: newVal } },
        { arrayFilters: [{ 'e': tmpVal }] }
      );
    }
  }

  return touched;
}

/**
 * Migrate an array-of-objects field's inner property.
 * e.g. faculties.class_mappings[].class_name
 *      faculties.substitute_assignments[].class_name
 */
async function migrateObjectArrayField(collection, arrayField, innerField, mapping) {
  const entries = Object.entries(mapping);
  const dottedPath = `${arrayField}.${innerField}`;
  let touched = 0;

  // ---- Pass 1 ----
  for (const [oldVal] of entries) {
    const tmpVal = `__tmp_${oldVal}`;
    const filter = { [dottedPath]: oldVal };
    const count = await collection.countDocuments(filter);
    if (count === 0) continue;

    log(`[${collection.collectionName}] ${dottedPath}: "${oldVal}" → "${tmpVal}" (${count})`);
    if (!DRY_RUN) {
      await collection.updateMany(
        filter,
        { $set: { [`${dottedPath}.$[e].${innerField}`]: tmpVal } },
        { arrayFilters: [{ [`e.${innerField}`]: oldVal }] }
      );
    }
    touched += count;
  }

  // ---- Pass 2 ----
  for (const [oldVal, newVal] of entries) {
    const tmpVal = `__tmp_${oldVal}`;
    const filter = { [dottedPath]: tmpVal };
    const count = await collection.countDocuments(filter);
    if (count === 0) continue;

    log(`[${collection.collectionName}] ${dottedPath}: "${tmpVal}" → "${newVal}" (${count})`);
    if (!DRY_RUN) {
      await collection.updateMany(
        filter,
        { $set: { [`${dottedPath}.$[e].${innerField}`]: newVal } },
        { arrayFilters: [{ [`e.${innerField}`]: tmpVal }] }
      );
    }
  }

  return touched;
}

// ==================== MAIN ====================
async function run() {
  console.log('=================================================');
  console.log(' Title Case Class Name Migration');
  console.log('=================================================');
  console.log(' Mode    :', DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will write)');
  console.log(' Mongo   :', MONGO_URI.replace(/\/\/.*@/, '//***@'));
  console.log(' Map     :', JSON.stringify(NAME_MAP, null, 2));
  console.log('-------------------------------------------------');

  try {
    await mongoose.connect(MONGO_URI);
    ok('Connected to MongoDB');

    const db = mongoose.connection.db;
    const faculties     = db.collection('faculties');
    const leaveRequests = db.collection('leaverequests');
    const holidays      = db.collection('holidays');

    let totalOps = 0;

    // ---- faculties ----
    totalOps += await migrateObjectArrayField(faculties, 'class_mappings', 'class_name', NAME_MAP);
    totalOps += await migrateObjectArrayField(faculties, 'substitute_assignments', 'class_name', NAME_MAP);
    totalOps += await migrateStringArrayField(faculties, 'preferences.substitute_preferences.preferred_classes', NAME_MAP);
    // assigned_class on faculty (stored as plain string — may be Title Case OR lowercase)
    totalOps += await migrateStringField(faculties, 'assigned_class', NAME_MAP);

    // ---- leaverequests ----
    totalOps += await migrateStringField(leaveRequests, 'assigned_class', NAME_MAP);

    // ---- holidays ----
    totalOps += await migrateStringArrayField(holidays, 'affected_classes', NAME_MAP);

    console.log('-------------------------------------------------');
    if (DRY_RUN) {
      ok(`DRY RUN complete. ${totalOps} document(s) would have been updated.`);
    } else {
      ok(`Migration complete. ${totalOps} document(s) updated.`);
    }
    console.log('=================================================');
  } catch (error) {
    err('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Connection closed.');
  }
}

run();