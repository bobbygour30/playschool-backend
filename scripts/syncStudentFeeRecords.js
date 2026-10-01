// scripts/syncStudentFeeRecords.js
// Usage:
//   node scripts/syncStudentFeeRecords.js --dry-run       preview, writes nothing
//   node scripts/syncStudentFeeRecords.js                 apply: start-month + current-month invoice for every student
//   node scripts/syncStudentFeeRecords.js --all-months    apply: EVERY month from start month to today
//   node scripts/syncStudentFeeRecords.js --mark-paid     students flagged "Paid" on their profile get a payment recorded on the back-filled first invoice
require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Fee = require('../models/Fee');
const { ensureStudentFeeRecord } = require('../utils/studentFeeSync');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ALL_MONTHS = args.includes('--all-months');
const MARK_PAID = args.includes('--mark-paid');
const coverage = ALL_MONTHS ? 'all' : 'current';

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ Set MONGODB_URI (or MONGO_URI) in your .env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(
    `✅ Connected. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'} | coverage: ${coverage}${MARK_PAID ? ' | mark-paid ON' : ''}\n`
  );

  const students = await Student.find().sort({ created_at: 1 });
  const feeStudentIds = new Set((await Fee.distinct('student_id')).map(String));
  const withoutAnyInvoice = students.filter((s) => !feeStudentIds.has(String(s._id)));
  console.log(`👩‍🎓 ${students.length} students, ${withoutAnyInvoice.length} have NO fee record at all\n`);

  const counts = {};
  const actionById = new Map();
  const problems = [];
  const paidOnProfile = [];

  for (const student of students) {
    try {
      const paymentInfo =
        MARK_PAID && student.fee_paid
          ? {
              amount: 'full',
              payment_date: student.payment_date || student.created_at,
              payment_method: student.payment_mode || 'Cash',
            }
          : null;

      const r = await ensureStudentFeeRecord(student, {
        dryRun: DRY_RUN,
        coverage,
        paymentInfo,
        noteSuffix: ' (back-filled)',
      });

      counts[r.action] = (counts[r.action] || 0) + 1;
      actionById.set(String(student._id), r);

      if (r.action === 'created' || r.action === 'would-create') {
        console.log(`   ${DRY_RUN ? '＋' : '✔'} ${student.name}: ${r.months_created.join(', ')}`);
        if (student.fee_paid && !MARK_PAID) paidOnProfile.push(student.name);
      }
      if (r.action === 'skipped-voided') {
        problems.push({ student: student.name, id: String(student._id), reason: r.reason });
      }
    } catch (err) {
      counts.error = (counts.error || 0) + 1;
      problems.push({ student: student.name, id: String(student._id), reason: err.message });
    }
  }

  console.log('\n📊 Summary');
  Object.entries(counts).forEach(([k, v]) => console.log(`   ${k.padEnd(18)} ${v}`));

  if (paidOnProfile.length) {
    console.log(`\n💳 ${paidOnProfile.length} student(s) are marked PAID on their profile but their invoice was created UNPAID.`);
    console.log('   Record the real payment from Finance, or re-run with --mark-paid.');
    paidOnProfile.forEach((n) => console.log(`   • ${n}`));
  }

  if (problems.length) {
    console.log(`\n⚠️  ${problems.length} student(s) need attention:`);
    problems.forEach((p) => console.log(`   • ${p.student} (${p.id}): ${p.reason}`));
  }

  // Who still has no invoice, and why
  if (!DRY_RUN) {
    const after = new Set((await Fee.distinct('student_id')).map(String));
    const still = students.filter((s) => !after.has(String(s._id)));
    if (still.length) {
      console.log(`\nℹ️  ${still.length} student(s) still have no invoice:`);
      still.forEach((s) => {
        const r = actionById.get(String(s._id));
        console.log(`   • ${s.name}: ${r?.action || 'error'}${r?.reason ? ' - ' + r.reason : ''}`);
      });
    } else {
      console.log('\n🎉 Every student now has a fee record.');
    }
  }

  // Duplicate invoices for the same student + month (report only, nothing is deleted)
  const dupes = await Fee.aggregate([
    { $match: { 'fee_period.month': { $exists: true, $ne: null } } },
    {
      $group: {
        _id: { s: '$student_id', m: '$fee_period.month' },
        count: { $sum: 1 },
        invoices: { $push: '$invoice_number' },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);
  if (dupes.length) {
    const names = new Map(students.map((s) => [String(s._id), s.name]));
    console.log(`\n⚠️  ${dupes.length} student/month combination(s) have DUPLICATE invoices (archive the extra one from Finance):`);
    dupes.forEach((d) =>
      console.log(`   • ${names.get(String(d._id.s)) || d._id.s} - ${d._id.m}: ${d.invoices.join(', ')}`)
    );
  }

  console.log(DRY_RUN ? '\nℹ️  Dry run only. Re-run without --dry-run to apply.' : '\n✅ Done.');
  await mongoose.disconnect();
})().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});