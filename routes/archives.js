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

const MODELS = { Student, Fee, Expense, Salary };

// Finance records can NEVER be permanently deleted. They stay in the archive for audit.
const FINANCE_TYPES = ['Fee', 'Expense', 'Salary'];

const REASON_TYPES = [
  'Duplicate record',
  'Created by mistake',
  'Incorrect amount',
  'Cancelled invoice',
  'Other',
];

const CLOUDINARY_FIELDS = {
  Student: ['documents.student_photo', 'documents.birth_certificate', 'documents.aadhar_card', 'documents.parent_aadhar_front', 'documents.parent_aadhar_back'],
  Fee: ['receipt_url'],
  Expense: ['receipt_url'],
  Salary: ['salary_slip_url'],
};

const getPath = (obj, path) =>
  path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toId = (id) => {
  try { return new mongoose.Types.ObjectId(String(id)); } catch { return id; }
};

// ==================== SHARED HELPERS (also used by finance.js / students.js) ====================

// Who is performing the action. Prefers the authenticated user (req.user);
// falls back to a header / body value if you have no auth middleware.
const getActor = (req) => {
  const u = req.user || {};
  return {
    id: u._id ? String(u._id) : u.id ? String(u.id) : null,
    name:
      u.name || u.username || u.email ||
      req.get('x-user-name') ||
      (req.body && req.body.archived_by_name) ||
      'Admin',
  };
};

// Validates { reason_type, reason } coming from the client.
// Returns { error } or { reason_type, reason (display text) }.
const parseArchiveReason = (input = {}, { required = true } = {}) => {
  const type = String(input.reason_type || '').trim();
  const text = String(input.reason || '').trim();

  if (!type) {
    if (required) return { error: 'Please select a reason for archiving / voiding this record' };
    return { reason_type: '', reason: text };
  }
  if (!REASON_TYPES.includes(type)) return { error: 'Invalid reason type' };
  if (type === 'Other' && !text) return { error: 'Please specify the reason' };

  const display = type === 'Other' ? text : text ? `${type} — ${text}` : type;
  return { reason_type: type, reason: display };
};

// True if this student is archived (or flagged as archived).
const isStudentArchived = async (studentOrId) => {
  if (!studentOrId) return false;
  const id = studentOrId._id || studentOrId;
  if (studentOrId.status === 'Archived' || studentOrId.is_archived === true) return true;
  return !!(await Archive.exists({ entity_type: 'Student', entity_id: toId(id) }));
};

// True if an invoice for this student+month was individually voided/archived.
// (Invoices archived together with the student are ignored: they come back on student restore.)
const hasArchivedInvoice = async (studentId, month) =>
  !!(await Archive.exists({
    entity_type: 'Fee',
    'snapshot.student_id': toId(studentId),
    'snapshot.fee_period.month': month,
    archive_source: { $ne: 'student' },
  }));

// ==================== ARCHIVE HELPERS ====================

const archiveDocument = async ({
  entity_type,
  doc,
  reason = '',
  reason_type = '',
  archived_by = null,
  archived_by_name = '',
  source = 'manual',
}) => {
  if (!doc) throw new Error('Document is required to archive');
  if (!MODELS[entity_type]) throw new Error(`Unknown entity type: ${entity_type}`);

  const plain = doc.toObject ? doc.toObject() : { ...doc };
  delete plain.__v;

  if (entity_type === 'Fee') {
    const rawStudent = plain.student_id;
    let studentName = '';

    if (rawStudent && typeof rawStudent === 'object' && rawStudent.name) {
      studentName = rawStudent.name;
      plain.student_id = rawStudent._id;
    } else if (rawStudent) {
      try {
        const s = await Student.findById(rawStudent).select('name');
        if (s) studentName = s.name;
      } catch { /* non-fatal */ }
    }
    plain.student_name = studentName || 'Student';
  }

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
    archive_reason_type: reason_type,
    archived_by: archived_by ? String(archived_by) : null,
    archived_by_name,
    archive_source: source,
    archived_at: new Date(),
  });

  await MODELS[entity_type].findByIdAndDelete(plain._id);
  return entry;
};

// Archive a student + all their invoices. `meta` = { reason, reason_type, archived_by, archived_by_name }
const archiveStudentWithFees = async (student, meta = {}) => {
  const fees = await Fee.find({ student_id: student._id });
  const entries = [];

  for (const fee of fees) {
    entries.push(
      await archiveDocument({ entity_type: 'Fee', doc: fee, ...meta, source: 'student' })
    );
  }
  entries.push(
    await archiveDocument({ entity_type: 'Student', doc: student, ...meta, source: 'manual' })
  );
  return entries;
};

const cleanupCloudinary = async (entry) => {
  const paths = CLOUDINARY_FIELDS[entry.entity_type] || [];
  for (const p of paths) {
    const url = getPath(entry.snapshot, p);
    if (url && typeof url === 'string' && url.startsWith('http')) {
      try { await deleteFromCloudinary(url); } catch (e) { /* non-fatal */ }
    }
  }
};

// ==================== ROUTES ====================

router.get('/', async (req, res) => {
  try {
    const { entity_type, search } = req.query;

    const query = {};
    if (entity_type && entity_type !== 'all') query.entity_type = entity_type;
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [
        { label: rx },
        { archive_reason: rx },
        { archived_by_name: rx },
        { 'snapshot.student_name': rx },
        { 'snapshot.invoice_number': rx },
      ];
    }

    const archives = await Archive.find(query)
      .select(
        'entity_type entity_id label archive_reason archive_reason_type archived_by archived_by_name archive_source archived_at ' +
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

// MUST be registered BEFORE `router.get('/:id')`
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
    delete snapshot.student_name;

    // An invoice can't live without its student
    if (entry.entity_type === 'Fee') {
      const liveStudent = await Student.exists({ _id: snapshot.student_id });
      if (!liveStudent) {
        return res.status(400).json({
          message: 'This invoice belongs to an archived student. Restore the student first (their invoices are restored with them).',
        });
      }
    }

    const existing = await Model.findById(snapshot._id);
    if (existing) delete snapshot._id;

    const doc = new Model(snapshot);
    doc.isNew = true;
    const saved = await doc.save();

    let restoredFees = 0;
    if (entry.entity_type === 'Student') {
      // Only the invoices that were archived WITH the student. Invoices that an admin
      // voided individually stay voided.
      const pendingFeeArchives = await Archive.find({
        entity_type: 'Fee',
        'snapshot.student_id': snapshot._id,
        archive_source: { $ne: 'manual' },
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

// DELETE /api/archives/empty/all — permanent delete of NON-finance entries only
router.delete('/empty/all', async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'A reason is required to empty the archive' });
    }

    const deletable = await Archive.find({ entity_type: { $nin: FINANCE_TYPES } });
    for (const e of deletable) await cleanupCloudinary(e);

    const result = await Archive.deleteMany({ entity_type: { $nin: FINANCE_TYPES } });
    const kept = await Archive.countDocuments({ entity_type: { $in: FINANCE_TYPES } });

    const actor = getActor(req);
    console.log(`🗑️ Archive emptied by ${actor.name}: ${result.deletedCount} deleted, ${kept} finance record(s) kept. Reason: ${reason}`);

    res.json({
      success: true,
      message: `Permanently deleted ${result.deletedCount} archived record(s). ${kept} finance record(s) (invoices, expenses, salaries) are protected and were kept.`,
    });
  } catch (error) {
    console.error('Error emptying archive:', error);
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/archives/:id — permanent delete (NOT allowed for finance records)
router.delete('/:id', async (req, res) => {
  try {
    const entry = await Archive.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Archive entry not found' });

    if (FINANCE_TYPES.includes(entry.entity_type)) {
      return res.status(403).json({
        message: 'Finance records (invoices, payments, expenses, salaries) cannot be permanently deleted. They are kept in the archive for audit.',
      });
    }

    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'A reason is required to permanently delete' });
    }

    await cleanupCloudinary(entry);

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

// ==================== EXPORTS ====================
router.archiveDocument = archiveDocument;
router.archiveStudentWithFees = archiveStudentWithFees;
router.parseArchiveReason = parseArchiveReason;
router.getActor = getActor;
router.isStudentArchived = isStudentArchived;
router.hasArchivedInvoice = hasArchivedInvoice;
router.REASON_TYPES = REASON_TYPES;
router.FINANCE_TYPES = FINANCE_TYPES;

module.exports = router;