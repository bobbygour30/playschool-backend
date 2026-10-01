// utils/studentFeeSync.js
// Guarantees a student has their fee record(s) in Finance. Safe to call repeatedly (idempotent).
const Fee = require('../models/Fee');
const Student = require('../models/Student');
const { dueDateFor, forceDueDate, monthKey } = require('./feeDates');

// Lazy require so we never hit a circular import with routes/archives
const archives = () => require('../routes/archives');

const pad = (n) => String(n).padStart(2, '0');

const monthsBetween = (from, to) => {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 60) {
    out.push(`${y}-${pad(m)}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
};

const periodFor = (month) => {
  const first = new Date(`${month}-01`);
  const next = new Date(first);
  next.setMonth(next.getMonth() + 1);
  return { start_date: first, end_date: new Date(next.getTime() - 1), month };
};

// Same amount rules as syncStudentFeesToFinance: recurring fees win over the one-time tuition/activity/cab fields
const amountsFor = (s) => {
  const rf = s.recurring_fees || {};
  const recurring = (rf.tuition_fee || 0) + (rf.activity_fee || 0) + (rf.transport_fee || 0);
  const useRecurring = recurring > 0;
  return {
    recurring,
    rf: {
      tuition_fee: rf.tuition_fee || 0,
      activity_fee: rf.activity_fee || 0,
      transport_fee: rf.transport_fee || 0,
    },
    first: {
      registration_fee: s.registration_fee || 0,
      admission_fee: s.admission_fee || 0,
      kit_fee: s.kit_fee || 0,
      camera_fee: s.camera_fee || 0,
      tuition_fee: useRecurring ? rf.tuition_fee || 0 : s.tuition_fee || 0,
      activity_fee: useRecurring ? rf.activity_fee || 0 : s.activity_fee || 0,
      transport_fee: useRecurring ? rf.transport_fee || 0 : s.cab_fee || 0,
      discount: s.discount || 0,
    },
  };
};

const firstInvoiceTotal = (a) => {
  const f = a.first;
  return Math.max(
    0,
    f.registration_fee + f.admission_fee + f.kit_fee + f.camera_fee +
      f.tuition_fee + f.activity_fee + f.transport_fee - f.discount
  );
};

// First invoice of a student: one-time fees + first month of recurring fees (+ optional initial payment)
async function createStartInvoice(student, a, month, dueDay, paymentInfo, noteSuffix) {
  const rf = student.recurring_fees || {};
  const invoice = new Fee({
    student_id: student._id,
    ...a.first,
    due_date: dueDateFor(month, dueDay),
    payment_method: paymentInfo?.payment_method || student.payment_mode || 'Cash',
    notes: `Initial invoice for ${student.name} - ${month}${noteSuffix}`,
    fee_period: periodFor(month),
    fee_plan: rf.fee_plan || 'Monthly',
    is_recurring: true,
    generated_for_month: month,
    recurring_fees: { ...a.rf, total_monthly: a.recurring, monthly_due_day: dueDay },
  });
  await invoice.save();
  await forceDueDate(Fee, invoice, month, dueDay);

  if (paymentInfo) {
    const total = invoice.total_amount || 0;
    const amount = paymentInfo.amount === 'full' ? total : parseFloat(paymentInfo.amount) || 0;

    if (amount > 0) {
      const paidOn = paymentInfo.payment_date ? new Date(paymentInfo.payment_date) : new Date();
      const method = paymentInfo.payment_method || 'Cash';

      await invoice.recordPayment({
        amount,
        payment_date: paidOn,
        payment_method: method,
        transaction_id: paymentInfo.transaction_id || '',
        payment_type: amount > total ? 'advance' : amount < total ? 'partial' : 'full',
        notes: `Initial payment for ${student.name}`,
      });

      // Dashboard reports group by recorded_at, so keep it in the month the money was really paid
      const last = invoice.payment_history[invoice.payment_history.length - 1];
      if (last) {
        last.recorded_at = paidOn;
        await invoice.save();
      }

      const patch = {
        fee_paid: amount >= total,
        payment_date: paidOn,
        payment_mode: method,
        'recurring_fees.initial_payment': {
          amount,
          paid: true,
          payment_date: paidOn,
          payment_method: method,
          invoice_id: invoice._id,
          transaction_id: paymentInfo.transaction_id || '',
        },
      };
      await Student.updateOne({ _id: student._id }, { $set: patch });
      if (typeof student.set === 'function') student.set(patch); // keep caller's copy in step
    }
  }
  return invoice;
}

// Later months: recurring fees only
async function createRecurringInvoice(student, a, month, dueDay) {
  const invoice = await Fee.generateRecurringInvoices(student._id, month, a.rf, dueDay);
  await forceDueDate(Fee, invoice, month, dueDay);
  return invoice;
}

/**
 * @param {Object} student   Student document
 * @param {Object} opts
 *   dryRun      {boolean}  report only, write nothing
 *   coverage    'start' | 'current' | 'all'
 *                 start   = only the student's start-month invoice (used on create/edit)
 *                 current = start month + this month
 *                 all     = every month from start month to this month
 *   paymentInfo {Object}   { amount | 'full', payment_date, payment_method, transaction_id } for the start invoice
 *   noteSuffix  {string}   appended to the invoice note (e.g. ' (back-filled)')
 * @returns {Object} { action, invoice_number, months_created, months_existing, months_voided, reason? }
 *   action: created | exists | would-create | skipped-graduated | skipped-archived |
 *           skipped-exempt | skipped-no-fees | skipped-voided
 */
async function ensureStudentFeeRecord(student, opts = {}) {
  const { dryRun = false, coverage = 'start', paymentInfo = null, noteSuffix = '' } = opts;
  const { isStudentArchived, hasArchivedInvoice } = archives();

  if (student.status === 'Graduated') return { action: 'skipped-graduated', reason: 'Student has graduated' };
  if (await isStudentArchived(student)) return { action: 'skipped-archived', reason: 'Student is archived' };
  if (student.fee_exempt) return { action: 'skipped-exempt', reason: 'Student is fee exempt' };

  const a = amountsFor(student);
  if (firstInvoiceTotal(a) <= 0) {
    return { action: 'skipped-no-fees', reason: 'No fee amounts are configured on this student' };
  }

  const rf = student.recurring_fees || {};
  const startMonth = rf.start_month || monthKey(0);
  const dueDay = rf.monthly_due_day || 5;
  const current = monthKey(0);
  const endMonth = rf.end_month || null;

  // Which months should have an invoice?
  let months = [startMonth];
  const wantsMore = student.status === 'Active' && a.recurring > 0 && rf.auto_generate !== false;
  if (wantsMore && coverage !== 'start' && current > startMonth) {
    if (coverage === 'all') {
      const last = endMonth && endMonth < current ? endMonth : current;
      const list = monthsBetween(startMonth, last);
      if (list.length) months = list;
    } else if (!endMonth || endMonth >= current) {
      months = [startMonth, current];
    }
  }

  const created = [];
  const existing = [];
  const voided = [];
  let firstInvoice = null;

  for (const month of months) {
    const isStart = month === startMonth;

    let inv = await Fee.findOne({ student_id: student._id, 'fee_period.month': month });
    if (inv) {
      existing.push(month);
      if (isStart) firstInvoice = inv;
      continue;
    }

    // An invoice an admin archived/voided on purpose must not silently come back
    if (await hasArchivedInvoice(student._id, month)) {
      voided.push(month);
      continue;
    }

    if (dryRun) {
      created.push(month);
      continue;
    }

    inv = isStart
      ? await createStartInvoice(student, a, month, dueDay, paymentInfo, noteSuffix)
      : await createRecurringInvoice(student, a, month, dueDay);
    created.push(month);
    if (isStart) firstInvoice = inv;
  }

  // Keep the recurring generator's bookmark accurate
  if (!dryRun && created.length) {
    const latest = created.filter((m) => m <= current).sort().pop();
    if (latest && (!rf.last_generated_month || latest > rf.last_generated_month)) {
      const patch = { 'recurring_fees.last_generated_month': latest };
      await Student.updateOne({ _id: student._id }, { $set: patch });
      if (typeof student.set === 'function') student.set(patch);
    }
  }

  let action = 'exists';
  if (created.length) action = dryRun ? 'would-create' : 'created';
  else if (voided.length && !existing.length) action = 'skipped-voided';

  return {
    action,
    invoice_number: firstInvoice?.invoice_number || null,
    months_created: created,
    months_existing: existing,
    months_voided: voided,
    reason: action === 'skipped-voided' ? 'The invoice for this month was archived/voided earlier' : undefined,
  };
}

module.exports = { ensureStudentFeeRecord };