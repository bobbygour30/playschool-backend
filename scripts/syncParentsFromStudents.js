// scripts/syncParentsFromStudents.js
// Usage:
//   node scripts/syncParentsFromStudents.js --dry-run   (preview, writes nothing)
//   node scripts/syncParentsFromStudents.js             (apply)
require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const { upsertParentFromStudent } = require('../utils/parentAutoSync');

let isStudentArchived = async () => false;
try {
  ({ isStudentArchived } = require('../routes/archives'));
} catch (e) {
  console.warn('Could not load archive helper, archived check disabled:', e.message);
}

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ Set MONGODB_URI (or MONGO_URI) in your .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`✅ Connected. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

  // 0. Back-fill new flags on parents created before this change
  if (!DRY_RUN) {
    const withPw = await Parent.updateMany(
      { login_enabled: { $exists: false }, password: { $type: 'string', $ne: '' } },
      { $set: { login_enabled: true, auto_created: false, source: 'manual' } }
    );
    const noPw = await Parent.updateMany(
      { login_enabled: { $exists: false } },
      { $set: { login_enabled: false, auto_created: false, source: 'manual' } }
    );
    console.log(`🔧 Back-filled existing parents: ${withPw.modifiedCount} with login, ${noPw.modifiedCount} without\n`);
  }

  // 1. Walk every student (oldest first so the first admission seeds the parent names)
  const students = await Student.find().sort({ created_at: 1 }).lean();
  console.log(`👩‍🎓 Found ${students.length} students\n`);

  const seen = new Map();
  const counts = {};
  const problems = [];

  for (const student of students) {
    try {
      if (await isStudentArchived(student)) {
        counts.archived = (counts.archived || 0) + 1;
        continue;
      }
      const result = await upsertParentFromStudent(student, { dryRun: DRY_RUN, seen });
      counts[result.action] = (counts[result.action] || 0) + 1;
      if (['conflict', 'skipped'].includes(result.action)) {
        problems.push({ student: student.name, id: String(student._id), ...result });
      }
    } catch (err) {
      counts.error = (counts.error || 0) + 1;
      problems.push({ student: student.name, id: String(student._id), action: 'error', reason: err.message });
    }
  }

  console.log('📊 Summary');
  Object.entries(counts).forEach(([k, v]) => console.log(`   ${k.padEnd(16)} ${v}`));

  if (problems.length) {
    console.log(`\n⚠️  ${problems.length} student(s) need manual attention:`);
    problems.forEach((p) => console.log(`   • ${p.student} (${p.id}) [${p.action}] ${p.reason}`));
  }

  console.log(
    DRY_RUN
      ? '\nℹ️  Dry run only. Re-run without --dry-run to apply.'
      : '\n✅ Done. Auto-created parents have NO password — set it via Parent Registration → Edit.'
  );

  await mongoose.disconnect();
})().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});