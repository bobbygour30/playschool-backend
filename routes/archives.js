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

// ==================== ARCHIVE HELPERS (imported by other routes) ====================

// Archive a single document (moves it out of the active collection, but keeps
// a full snapshot so it can be restored later).
const archiveDocument = async ({ entity_type, doc, reason = '', archived_by = null }) => {
  if (!doc) throw new Error('Document is required to archive');
  if (!MODELS[entity_type]) throw new Error(`Unknown entity type: ${entity_type}`);

  const plain = doc.toObject ? doc.toObject() : { ...doc };
  delete plain.__v;

  // Pick a friendly label for the archive list
  let label = '';
  if (entity_type === 'Student') label = plain.name || 'Student';
  else if (entity_type === 'Fee') label = `${plain.invoice_number || 'Invoice'} — ${plain.fee_period?.month || ''}`.trim();
  else if (entity_type === 'Expense') label = `${plain.category || 'Expense'} — ₹${plain.amount || 0}`;
  else if (entity_type === 'Salary') label = `${plain.month ? new Date(plain.month).toISOString().slice(0, 7) : ''} — ₹${plain.net_salary || 0}`.trim();

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
      ];
    }

    const archives = await Archive.find(query).sort({ archived_at: -1 });

    // Light summary for cards
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

// POST /api/archives/:id/restore — put the record back into its live collection
router.post('/:id/restore', async (req, res) => {
  try {
    const entry = await Archive.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Archive entry not found' });

    const Model = MODELS[entry.entity_type];
    if (!Model) return res.status(400).json({ message: 'Unknown entity type' });

    // If the original _id is still in use (shouldn't happen, but be safe),
    // let Mongo generate a new one.
    const snapshot = { ...entry.snapshot };
    const existing = await Model.findById(snapshot._id);
    if (existing) delete snapshot._id;

    // Restore via the model's normal save path so pre-save hooks (invoice
    // counter, fee total recalculation, etc.) run as usual.
    const doc = new Model(snapshot);
    // Mark as not-new for _id preservation:
    doc.isNew = true;
    const saved = await doc.save();

    // When restoring a Student, also restore any of their archived fee invoices
    let restoredFees = 0;
    if (entry.entity_type === 'Student') {
      const pendingFeeArchives = await Archive.find({
        entity_type: 'Fee',
        'snapshot.student_id': snapshot._id,
      });
      for (const feeArchive of pendingFeeArchives) {
        const feeSnap = { ...feeArchive.snapshot, student_id: saved._id };
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

    // Clean up Cloudinary assets tied to this snapshot, if any
    const paths = CLOUDINARY_FIELDS[entry.entity_type] || [];
    for (const p of paths) {
      const url = getPath(entry.snapshot, p);
      if (url && typeof url === 'string' && url.startsWith('http')) {
        try { await deleteFromCloudinary(url); } catch (e) { /* non-fatal */ }
      }
    }

    // Audit + remove
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

// DELETE /api/archives/empty/all — permanently empty the whole archive (admin)
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

// ==================== ARCHIVED STUDENT FULL PROFILE ====================
// Returns the student archive entry + every archived fee invoice + the merged
// payment history, so the UI can render the full "Archived Student Profile".
router.get('/:id/student-profile', async (req, res) => {
  try {
    const entry = await Archive.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Archive entry not found' });
    if (entry.entity_type !== 'Student') {
      return res.status(400).json({ message: 'This archive entry is not a student' });
    }

    const studentId = entry.snapshot?._id;

    // Every archived fee invoice whose snapshot points at this student
    const feeArchives = await Archive.find({
      entity_type: 'Fee',
      'snapshot.student_id': studentId,
    }).sort({ archived_at: -1 });

    const feeInvoices = feeArchives.map((f) => f.snapshot);

    // Merge payment history from all invoices, sorted newest first
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
      // Older invoices may have paid_amount but no explicit history — reflect that too
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
      fee_archive_ids: feeArchives.map((f) => f._id),   // for restore bookkeeping
      fee_invoices: feeInvoices,
      payments,
      totals,
    });
  } catch (error) {
    console.error('Error fetching archived student profile:', error);
    res.status(500).json({ message: error.message });
  }
});
// ==================== EXPORTS ====================
// IMPORTANT: attach helpers to the router object (do NOT reassign module.exports
// after this line, or the helpers will be lost).
router.archiveDocument = archiveDocument;
router.archiveStudentWithFees = archiveStudentWithFees;

module.exports = router;