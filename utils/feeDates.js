// utils/feeDates.js
const { dayStr } = require('./feeStatus');
const pad = (n) => String(n).padStart(2, '0');

// Current month in the school's timezone (matches feeStatus.js), not server time
const monthKey = (offset = 0) => {
  const [y, m] = dayStr(new Date()).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

// 12:00 UTC on (month, day), clamped to month length (same rule as Fee.computeDueDate)
const dueDateFor = (monthStr, day) => {
  const base = /^\d{4}-\d{2}$/.test(monthStr || '') ? monthStr : monthKey(0);
  const [y, m] = base.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(Math.max(parseInt(day) || 5, 1), daysInMonth);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
};

// Compare by IST calendar day, so old local-midnight dates aren't flagged falsely
const sameDay = (a, b) => dayStr(a) === dayStr(b);

const forceDueDate = async (Fee, invoice, monthStr, day) => {
  if (!invoice) return invoice;
  const wanted = dueDateFor(monthStr, day);
  if (!invoice.due_date || !sameDay(invoice.due_date, wanted)) {
    await Fee.updateOne({ _id: invoice._id }, { $set: { due_date: wanted } });
    invoice.due_date = wanted;
  }
  return invoice;
};

// One-time bulk repair: fixes every invoice whose due_date doesn't match the
// student's configured monthly due day (falls back to the invoice's own
// monthly_due_day, then to 5). Called on server start. Returns count updated.
const repairAllDueDates = async (Fee) => {
  const fees = await Fee.find({ 'fee_period.month': { $exists: true, $ne: null } })
    .populate('student_id', 'recurring_fees');
  const ops = [];
  for (const fee of fees) {
    const month = fee.fee_period.month;
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const day =
      fee.student_id?.recurring_fees?.monthly_due_day ||
      fee.recurring_fees?.monthly_due_day ||
      5;
    const wanted = dueDateFor(month, day);
    if (!fee.due_date || !sameDay(fee.due_date, wanted)) {
      ops.push({
        updateOne: {
          filter: { _id: fee._id },
          update: { $set: { due_date: wanted } },
        },
      });
    }
  }
  if (ops.length) await Fee.bulkWrite(ops);
  return ops.length;
};

module.exports = { dueDateFor, monthKey, sameDay, forceDueDate, repairAllDueDates };