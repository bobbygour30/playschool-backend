// routes/archives.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Archive = require('../models/Archive');
const Student = require('../models/Student');
const Fee = require('../models/Fee');
const Expense = require('../models/Expense');
const Salary = require('../models/Salary');
const { deleteFromCloudinary } = require('../config/cloudinary');

// Map entity type -> model
const MODELS = {
  Student: Student,
  Fee: Fee,
  Expense: Expense,
  Salary: Salary,
};

// Fields on each model that hold Cloudinary URLs — cleaned up on permanent delete
const CLOUDINARY_FIELDS = {
  Student: ['documents.student_photo', 'documents.birth_certificate', 'documents.aadhar_card', 'documents.parent_aadhar_front', 'documents.parent_aadhar_back'],
  Fee: ['receipt_url'],
  Expense: ['receipt_url'],
  Salary: ['salary_slip_url'],
};

// Walk a dot-path like 'documents.student_photo' on a plain object
const getPath = (obj, path) =>
  path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);

// ==================== ARCHIVE HELPERS ====================

// Archive a single document. The snapshot always gets a friendly
// `student_name` (for fees) so the UI can display it forever, even after
// the student itself has been permanently deleted.
const archiveDocument = async ({ entity_type, doc, reason = '', archived_by = null }) => {
  if (!doc) throw new Error('Document is required to archive');
  if (!MODELS[entity_type]) throw new Error(`Unknown entity type: ${entity_type}`);

  const plain = doc.toObject ? doc.toObject() : { ...doc };
  delete plain.__v;

  // ---------- Stamp a durable student_name into Fee snapshots ----------
  if (entity_type === 'Fee') {
    const rawStudent = plain.student_id;
    let studentName = '';

    if (rawStudent && typeof rawStudent === 'object' && rawStudent.name) {
      // Already populated
      studentName = rawStudent.name;
      // Store only the id (so restore doesn't try to embed the whole object)
      plain.student_id = rawStudent._id;
    } else if (rawStudent) {
      // Raw ObjectId — look the student up for the name
      try {
        const s = await Student.findById(rawStudent).select('name');
        if (s) studentName = s.name;
      } catch { /* non-fatal */ }
    }

    plain.student_name = studentName || 'Student';
  }

  // Pick a friendly label for the archive list
  let label = '';
  if (entity_type === 'Student') {
    label = plain.name || 'Student';
  } else if (entity_type === 'Fee') {
    const sName = plain.student_name || 'Student';
    label = `${sName} — ${plain.invoice_number || 'Invoice'}${plain.fee_period?.month ? ' (' + plain.fee_period.month + ')' : ''}`;
  } else if (entity_type === 'Expense') {
    label = `${plain.category || 'Expense'} — ₹${plain.amount || 0}`;
  } else if (entity_type === 'Salary') {
    label = `${plain.month ? new Date(plain.month).toISOString().slice(0, 7) : ''} — ₹${plain.net_salary || 0}`.trim();
  }

  const entry = await Archive.create({
    entity_type,
    entity_id: plain._id,
    snapshot: plain,
    label,
    archive_reason: reason,
    archived_by,
  });

  // Remove from the live collection
  await MODELS[entity_type].findByIdAndDelete(plain._id);

  return entry;
};

// Archive a student + every fee invoice attached to them (keeps the graph intact)
const archiveStudentWithFees = async (student, reason = '', archived_by = null) => {
  const fees = await Fee.find({ student_id: student._id });
  const entries = [];

  for (const fee of fees) {
    entries.push(
      await archiveDocument({ entity_type: 'Fee', doc: fee, reason, archived_by })
    );
  }

  entries.push(
    await archiveDocument({ entity_type: 'Student', doc: student, reason, archived_by })
  );

  return entries;
};

// ==================== ROUTES ====================

// GET /api/archives — list archived records (optionally filtered by type)
router.get('/', async (req, res) => {
  try {
    const { entity_type, search } = req.query;

    const query = {};
    if (entity_type && entity_type !== 'all') query.entity_type = entity_type;
    if (search) {
      query.$or = [
        { label: new RegExp(search, 'i') },
        { archive_reason: new RegExp(search, 'i') },
        { 'snapshot.student_name': new RegExp(search, 'i') },
        { 'snapshot.invoice_number': new RegExp(search, 'i') },
      ];
    }

    // Only pull the fields the list UI needs — keeps the payload small.
    const archives = await Archive.find(query)
      .select(
        'entity_type entity_id label archive_reason archived_at ' +
        'snapshot.student_name snapshot.student_id ' +
        'snapshot.invoice_number snapshot.fee_period.month ' +
        'snapshot.total_amount snapshot.paid_amount snapshot.remaining_amount ' +
        'snapshot.name snapshot.class_id snapshot.section snapshot.parent_name snapshot.parent_phone ' +
        'snapshot.category snapshot.vendor_name snapshot.amount ' +
        'snapshot.month snapshot.net_salary snapshot.staff_id ' +
        'snapshot.status snapshot.due_date'
      )
      .sort({ archived_at: -1 });

    const summary = {
      total: await Archive.countDocuments(),
      Student: await Archive.countDocuments({ entity_type: 'Student' }),
      Fee: await Archive.countDocuments({ entity_type: 'Fee' }),
      Expense: await Archive.countDocuments({ entity_type: 'Expense' }),
      Salary: await Archive.countDocuments({ entity_type: 'Salary' }),
    };

    res.json({ data: archives, summary });
  } catch (error) {
    console.error('Error fetching archives:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== ARCHIVED STUDENT FULL PROFILE ====================
// ⚠️ MUST be registered BEFORE `router.get('/:id', ...)`, otherwise Express
//    will match '/:id' first and treat 'student-profile' as the id.
router.get('/:id/student-profile', async (req, res) => {
  try {
    const entry = await Archive.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Archive entry not found' });
    if (entry.entity_type !== 'Student') {
      return res.status(400).json({ message: 'This archive entry is not a student' });
    }

    const studentId = entry.snapshot?._id;

    const feeArchives = await Archive.find({
      entity_type: 'Fee',
      'snapshot.student_id': studentId,
    }).sort({ archived_at: -1 });

    const feeInvoices = feeArchives.map((f) => f.snapshot);

    // Merge payment history
    const payments = [];
    for (const inv of feeInvoices) {
      const history = Array.isArray(inv.payment_history) ? inv.payment_history : [];
      for (const p of history) {
        payments.push({
          invoice_number: p.invoice_number || inv.invoice_number,
          fee_period: inv.fee_period?.month,
          date: p.payment_date || p.recorded_at,
          amount: p.amount || 0,
          payment_type: p.payment_type,
          payment_method: p.payment_method,
          transaction_id: p.transaction_id,
          notes: p.notes,
          advance_allocation: p.advance_allocation || [],
        });
      }
      if (history.length === 0 && (inv.paid_amount || 0) > 0) {
        const total = inv.total_amount || 0;
        payments.push({
          invoice_number: inv.invoice_number,
          fee_period: inv.fee_period?.month,
          date: inv.payment_date || inv.invoice_date,
          amount: inv.paid_amount,
          payment_type: inv.paid_amount > total ? 'advance' : inv.paid_amount < total ? 'partial' : 'full',
          payment_method: inv.payment_method,
          transaction_id: inv.transaction_id,
          notes: 'Payment recorded on the invoice',
          advance_allocation: [],
        });
      }
    }
    payments.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const totals = feeInvoices.reduce(
      (acc, inv) => {
        acc.charged += inv.total_amount || 0;
        acc.paid += inv.paid_amount || 0;
        return acc;
      },
      { charged: 0, paid: 0 }
    );
    totals.outstanding = Math.max(0, totals.charged - totals.paid);
    totals.advance = Math.max(0, totals.paid - totals.charged);

    res.json({
      student_archive_id: entry._id,
      student: entry.snapshot,
      archive_reason: entry.archive_reason,
      archived_at: entry.archived_at,
      fee_archive_ids: feeArchives.map((f) => f._id),
      fee_invoices: feeInvoices,
      payments,
      totals,
    });
  } catch (error) {
    console.error('Error fetching archived student profile:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET /api/archives/:id — single archive entry with full snapshot
router.get('/:id', async (req, res) => {
  try {
    const entry = await Archive.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Archive entry not found' });
    res.json(entry);
  } catch (error) {
    console.error('Error fetching archive:', error);
    res.status(500).json({ message: error.message });
  }
});

// POST /api/archives/:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    const entry = await Archive.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Archive entry not found' });

    const Model = MODELS[entry.entity_type];
    if (!Model) return res.status(400).json({ message: 'Unknown entity type' });

    const snapshot = { ...entry.snapshot };
    delete snapshot.student_name; // our added helper field, not part of the Fee schema

    const existing = await Model.findById(snapshot._id);
    if (existing) delete snapshot._id;

    const doc = new Model(snapshot);
    doc.isNew = true;
    const saved = await doc.save();

    let restoredFees = 0;
    if (entry.entity_type === 'Student') {
      const pendingFeeArchives = await Archive.find({
        entity_type: 'Fee',
        'snapshot.student_id': snapshot._id,
      });
      for (const feeArchive of pendingFeeArchives) {
        const feeSnap = { ...feeArchive.snapshot, student_id: saved._id };
        delete feeSnap.student_name;
        try {
          const feeDoc = new Fee(feeSnap);
          feeDoc.isNew = true;
          await feeDoc.save();
          await Archive.findByIdAndDelete(feeArchive._id);
          restoredFees++;
        } catch (e) {
          console.error('Failed to restore fee during student restore:', e.message);
        }
      }
    }

    await Archive.findByIdAndDelete(entry._id);

    res.json({
      success: true,
      message: `Restored ${entry.entity_type}${restoredFees ? ` and ${restoredFees} invoice(s)` : ''}`,
      restored_id: saved._id,
      restored_fees: restoredFees,
    });
  } catch (error) {
    console.error('Error restoring archive:', error);
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/archives/:id — permanent delete (requires a reason)
router.delete('/:id', async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'A reason is required to permanently delete' });
    }

    const entry = await Archive.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Archive entry not found' });

    const paths = CLOUDINARY_FIELDS[entry.entity_type] || [];
    for (const p of paths) {
      const url = getPath(entry.snapshot, p);
      if (url && typeof url === 'string' && url.startsWith('http')) {
        try { await deleteFromCloudinary(url); } catch (e) { /* non-fatal */ }
      }
    }

    entry.permanent_delete_reason = reason;
    entry.permanently_deleted_at = new Date();
    await entry.save();
    await Archive.findByIdAndDelete(entry._id);

    res.json({ success: true, message: `${entry.entity_type} permanently deleted` });
  } catch (error) {
    console.error('Error permanently deleting archive:', error);
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/archives/empty/all
router.delete('/empty/all', async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'A reason is required to empty the archive' });
    }
    const result = await Archive.deleteMany({});
    res.json({ success: true, message: `Permanently deleted ${result.deletedCount} archived record(s)` });
  } catch (error) {
    console.error('Error emptying archive:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== EXPORTS ====================
router.archiveDocument = archiveDocument;
router.archiveStudentWithFees = archiveStudentWithFees;

module.exports = router;