// scripts/removeDuplicateStudents.js
// Usage:
//   node scripts/removeDuplicateStudents.js            (preview only)
//   node scripts/removeDuplicateStudents.js --apply    (archive the duplicates)
require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Fee = require('../models/Fee');
const { archiveStudentWithFees } = require('../routes/archives');

const APPLY = process.argv.includes('--apply');

const normName = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normEmail = (s) => (s || '').trim().toLowerCase();
const normPhone = (s) => (s || '').replace(/\D/g, '');
const dayKey = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

// Cluster students of the same name+DOB where parent email OR phone matches
function clusterDuplicates(students) {
  const byNameDob = new Map();
  for (const s of students) {
    const k = `${normName(s.name)}|${dayKey(s.date_of_birth)}`;
    if (!byNameDob.has(k)) byNameDob.set(k, []);
    byNameDob.get(k).push(s);
  }

  const clusters = [];
  for (const group of byNameDob.values()) {
    if (group.length < 2) continue;
    const used = new Set();
    for (let i = 0; i < group.length; i++) {
      if (used.has(i)) continue;
      const cluster = [group[i]];
      used.add(i);
      for (let j = i + 1; j < group.length; j++) {
        if (used.has(j)) continue;
        const sameParent = cluster.some(
          (c) =>
            (normEmail(c.parent_email) && normEmail(c.parent_email) === normEmail(group[j].parent_email)) ||
            (normPhone(c.parent_phone) && normPhone(c.parent_phone) === normPhone(group[j].parent_phone))
        );
        if (sameParent) {
          cluster.push(group[j]);
          used.add(j);
        }
      }
      if (cluster.length > 1) clusters.push(cluster);
    }
  }
  return clusters;
}

async function paidAmountFor(studentId) {
  const fees = await Fee.find({ student_id: studentId }).select('paid_amount');
  return fees.reduce((sum, f) => sum + (f.paid_amount || 0), 0);
}

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ Set MONGODB_URI (or MONGO_URI) in your .env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`✅ Connected. Mode: ${APPLY ? 'APPLY' : 'PREVIEW (no changes)'}\n`);

  const students = await Student.find().sort({ created_at: 1 });
  const clusters = clusterDuplicates(students);

  if (clusters.length === 0) {
    console.log('🎉 No duplicate students found.');
    await mongoose.disconnect();
    return;
  }

  console.log(`⚠️  Found ${clusters.length} duplicate group(s)\n`);
  let archivedCount = 0;

  for (const cluster of clusters) {
    // Pick keeper: most money paid, then oldest
    const scored = [];
    for (const s of cluster) scored.push({ s, paid: await paidAmountFor(s._id) });
    scored.sort((a, b) => b.paid - a.paid || new Date(a.s.created_at) - new Date(b.s.created_at));

    const keeper = scored[0].s;
    const extras = scored.slice(1);

    console.log(`👤 ${keeper.name} (DOB ${dayKey(keeper.date_of_birth)}, ${keeper.parent_email})`);
    console.log(`   KEEP    ${keeper._id}  paid ₹${scored[0].paid}`);

    for (const { s, paid } of extras) {
      console.log(`   ARCHIVE ${s._id}  paid ₹${paid}${paid > 0 ? '  ⚠️ HAS PAYMENTS - review manually' : ''}`);

      if (!APPLY) continue;

      // Never auto-archive a record that has money on it
      if (paid > 0) {
        console.log('      ↳ skipped (has payments)');
        continue;
      }

      await archiveStudentWithFees(s, {
        reason: `Duplicate of student ${keeper._id} (auto-cleanup)`,
        reason_type: 'other', // ← change if your archive reason_type enum uses a different value
        archived_by: null,
        archived_by_name: 'Duplicate cleanup script',
      });

      // Remove the duplicate from any parent's linked students
      await Parent.updateMany({ student_ids: s._id }, { $pull: { student_ids: s._id } });
      archivedCount++;
    }
    console.log('');
  }

  console.log(
    APPLY
      ? `✅ Done. Archived ${archivedCount} duplicate student(s). Restore from Archived Records if needed.`
      : 'ℹ️  Preview only. Re-run with --apply to archive the duplicates.'
  );
  await mongoose.disconnect();
})().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});