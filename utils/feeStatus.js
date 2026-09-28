// utils/feeStatus.js
const TZ = 'Asia/Kolkata';

// 'YYYY-MM-DD' in school's timezone (string compare is safe for this format)
const dayStr = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });

/**
 * Single source of truth for invoice status.
 *
 *  remaining_amount = total - paid              (what is still unpaid, always payable)
 *  amount_due       = remaining, but 0 BEFORE the due date
 *  phase            = Upcoming (< due date) | Due (on due date) | Overdue (> due date)
 *  advance_amount   = paid beyond the invoice total (credit)
 *
 *  status:
 *    total = 0                          -> 'No Dues'
 *    fully paid, before due date        -> 'Advance'
 *    fully paid, on/after due date      -> 'Paid'
 *    partly paid                        -> 'Partial'  (+ phase Upcoming/Due/Overdue)
 *    nothing paid                       -> phase      (Upcoming / Due / Overdue)
 */
function computeFeeStatus({ total_amount, paid_amount, due_date, now = new Date() }) {
  const total = Math.max(0, Number(total_amount) || 0);
  const paid = Math.max(0, Number(paid_amount) || 0);
  const remaining = Math.max(0, total - paid);
  const credit = Math.max(0, paid - total);

  const today = dayStr(now);
  const due = due_date ? dayStr(due_date) : null;

  let phase = 'Upcoming';
  if (due) {
    if (today > due) phase = 'Overdue';
    else if (today === due) phase = 'Due';
  }

  let status;
  if (total === 0) {
    status = 'No Dues';
    phase = null;
  } else if (remaining === 0) {
    status = phase === 'Upcoming' ? 'Advance' : 'Paid';
  } else if (paid > 0) {
    status = 'Partial';
  } else {
    status = phase;
  }

  const amount_due = total === 0 || phase === 'Upcoming' ? 0 : remaining;
  const overdue_amount = phase === 'Overdue' ? remaining : 0;

  return {
    status,
    phase,
    remaining_amount: remaining,
    amount_due,
    overdue_amount,
    advance_amount: credit,
  };
}

module.exports = { computeFeeStatus, dayStr };