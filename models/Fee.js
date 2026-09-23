const mongoose = require('mongoose');

const feeSchema = new mongoose.Schema({
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true,
  },
  
  registration_fee: { type: Number, default: 0 },
  admission_fee: { type: Number, default: 0 },
  tuition_fee: { type: Number, default: 0 },
  activity_fee: { type: Number, default: 0 },
  kit_fee: { type: Number, default: 0 },
  transport_fee: { type: Number, default: 0 },
  camera_fee: { type: Number, default: 0 },
  
  // Recurring fees (monthly)
  recurring_fees: {
    tuition_fee: { type: Number, default: 0 },
    activity_fee: { type: Number, default: 0 },
    transport_fee: { type: Number, default: 0 },
    total_monthly: { type: Number, default: 0 },
    // Day of month (1-31) this invoice's monthly fee is due on.
    // Carried on the invoice for record-keeping; the source of truth for
    // FUTURE invoices lives on Student.recurring_fees.monthly_due_day.
    monthly_due_day: {
      type: Number,
      min: 1,
      max: 31,
      default: 5,
    },
  },
  
  fee_period: {
    start_date: { type: Date },
    end_date: { type: Date },
    month: { type: String }, // Format: YYYY-MM
  },
  
  fee_plan: {
    type: String,
    enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'One-Time'],
    default: 'Monthly',
  },
  
  total_amount: { type: Number, default: 0 },
  
  // Payment tracking
  paid_amount: { type: Number, default: 0 },
  // The REAL outstanding amount (total - paid), regardless of due date.
  // Always used when a parent is actually recording/paying, including
  // paying an upcoming invoice early.
  remaining_amount: { type: Number, default: 0 },
  // DISPLAY-ONLY balance that respects the monthly due date:
  // 0 before the due date ("Upcoming"), the real remaining amount on/after
  // the due date. Never negative. This is what the finance table shows.
  balance_due: { type: Number, default: 0 },
  advance_amount: { type: Number, default: 0 },
  overdue_amount: { type: Number, default: 0 },
  
  due_date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Upcoming', 'Due', 'Pending', 'Paid', 'Overdue', 'Partial', 'Advance'],
    default: 'Upcoming',
  },
  
  // Payment details
  payment_date: {
    type: Date,
    default: null,
  },
  payment_method: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'],
    default: 'Cash',
  },
  transaction_id: {
    type: String,
    default: '',
  },
  
  payment_history: [{
    amount: {
      type: Number,
      required: true,
    },
    payment_date: {
      type: Date,
      default: Date.now,
    },
    payment_method: {
      type: String,
      enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'],
      required: true,
    },
    transaction_id: {
      type: String,
      default: '',
    },
    payment_type: {
      type: String,
      enum: ['full', 'partial', 'advance', 'recurring'],
      required: true,
    },
    invoice_id: {
      type: String,
      default: '',
    },
    invoice_number: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    recorded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    recorded_at: {
      type: Date,
      default: Date.now,
    },
    advance_allocation: [{
      month: { type: String },
      amount: { type: Number },
      invoice_id: { type: String },
    }],
  }],
  
  invoice_number: {
    type: String,
    unique: true,
    sparse: true,
  },
  invoice_date: {
    type: Date,
    default: Date.now,
  },
  invoice_url: {
    type: String,
    default: null,
  },
  
  notes: {
    type: String,
    default: '',
  },
  receipt_url: {
    type: String,
    default: null,
  },
  
  is_recurring: {
    type: Boolean,
    default: false,
  },
  parent_fee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fee',
    default: null,
  },
  child_fee_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fee',
  }],
  generated_for_month: {
    type: String,
    default: null,
  },
  
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

feeSchema.index({ student_id: 1, due_date: -1 });
feeSchema.index({ status: 1 });
feeSchema.index({ invoice_number: 1 });
feeSchema.index({ generated_for_month: 1 });
feeSchema.index({ 'fee_period.month': 1 });

// ==================== LIVE STATUS / BALANCE COMPUTATION ====================
// Status and balance are date-sensitive (Upcoming -> Due -> Overdue), so this
// is computed on demand — at save time AND every time a fee is fetched by a
// route — rather than trusted purely from whatever was last persisted. This
// keeps a fee that simply "sits" past its due date (with no writes) accurate
// the moment it's read.
feeSchema.methods.computeLiveStatus = function () {
  const total = this.total_amount || 0;
  const paid = this.paid_amount || 0;
  const remaining = Math.max(0, total - paid);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = this.due_date ? new Date(this.due_date) : new Date();
  dueDate.setHours(0, 0, 0, 0);

  let status;
  let balance_due;
  let overdue_amount;

  if (remaining <= 0 && total > 0) {
    status = (this.advance_amount || 0) > 0 ? 'Advance' : 'Paid';
    balance_due = 0;
    overdue_amount = 0;
  } else if (paid > 0) {
    // A partial payment already exists against this invoice — it's already
    // "active", so show the outstanding balance regardless of the due date.
    status = 'Partial';
    balance_due = remaining;
    overdue_amount = today > dueDate ? remaining : 0;
  } else if (today < dueDate) {
    status = 'Upcoming';
    balance_due = 0;
    overdue_amount = 0;
  } else if (today.getTime() === dueDate.getTime()) {
    status = 'Due';
    balance_due = remaining;
    overdue_amount = 0;
  } else {
    status = 'Overdue';
    balance_due = remaining;
    overdue_amount = remaining;
  }

  return {
    status,
    remaining_amount: remaining,
    balance_due: Math.max(0, balance_due),
    overdue_amount: Math.max(0, overdue_amount),
  };
};

// A plain object with live-computed fields merged in — safe to send
// straight out of a route as JSON.
feeSchema.methods.toLiveJSON = function () {
  const obj = this.toObject();
  const live = this.computeLiveStatus();
  obj.status = live.status;
  obj.remaining_amount = live.remaining_amount;
  obj.balance_due = live.balance_due;
  obj.overdue_amount = live.overdue_amount;
  return obj;
};

// Given a 'YYYY-MM' month and a day-of-month (1-31), returns the due Date
// for that month, clamped to the month's last valid day (e.g. day 31 in
// February becomes the 28th/29th).
feeSchema.statics.computeDueDate = function (month, dueDay) {
  const safeMonth = month || new Date().toISOString().slice(0, 7);
  const [year, mon] = safeMonth.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const day = Math.min(Math.max(parseInt(dueDay) || 5, 1), daysInMonth);
  return new Date(year, mon - 1, day);
};

feeSchema.pre('save', async function (next) {
  this.updated_at = Date.now();
  
  this.total_amount = 
    (this.registration_fee || 0) + 
    (this.admission_fee || 0) + 
    (this.tuition_fee || 0) + 
    (this.activity_fee || 0) + 
    (this.kit_fee || 0) + 
    (this.transport_fee || 0) + 
    (this.camera_fee || 0);
  
  this.recurring_fees.total_monthly = 
    (this.recurring_fees.tuition_fee || 0) + 
    (this.recurring_fees.activity_fee || 0) + 
    (this.recurring_fees.transport_fee || 0);
  
  const live = this.computeLiveStatus();
  this.remaining_amount = live.remaining_amount;
  this.balance_due = live.balance_due;
  this.overdue_amount = live.overdue_amount;
  this.status = live.status;
  
  if (!this.invoice_number) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const count = await mongoose.model('Fee').countDocuments();
    this.invoice_number = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }
  
  next();
});

// Method to record a payment with automatic status update
feeSchema.methods.recordPayment = function (paymentData) {
  const { 
    amount, 
    payment_method, 
    transaction_id, 
    payment_type, 
    notes, 
    recorded_by,
    invoice_number,
    advance_allocation,
    payment_date,
  } = paymentData;
  
  this.payment_history.push({
    amount,
    payment_date: payment_date || new Date(),
    payment_method,
    transaction_id: transaction_id || '',
    payment_type,
    invoice_number: invoice_number || this.invoice_number,
    notes: notes || '',
    recorded_by: recorded_by || null,
    advance_allocation: advance_allocation || [],
  });
  
  const paidBefore = this.paid_amount || 0;
  this.paid_amount = paidBefore + amount;
  
  if (payment_type === 'advance') {
    const remainingBefore = Math.max(0, (this.total_amount || 0) - paidBefore);
    const advancePortion = Math.max(0, amount - remainingBefore);
    this.advance_amount = (this.advance_amount || 0) + advancePortion;
  }
  
  const live = this.computeLiveStatus();
  this.remaining_amount = live.remaining_amount;
  this.balance_due = live.balance_due;
  this.overdue_amount = live.overdue_amount;
  this.status = live.status;
  
  if (['Paid', 'Partial', 'Advance'].includes(live.status)) {
    this.payment_date = payment_date || new Date();
    this.payment_method = payment_method;
    this.transaction_id = transaction_id || '';
  }
  
  return this.save();
};

// Method to generate a single recurring invoice for a given month, with its
// due_date computed from the configured monthly due day.
feeSchema.statics.generateRecurringInvoices = async function (studentId, month, fees, dueDay = 5) {
  const { tuition_fee, activity_fee, transport_fee } = fees;
  
  const totalMonthly = (tuition_fee || 0) + (activity_fee || 0) + (transport_fee || 0);
  const dueDate = this.computeDueDate(month, dueDay);
  
  const invoice = new this({
    student_id: studentId,
    recurring_fees: {
      tuition_fee: tuition_fee || 0,
      activity_fee: activity_fee || 0,
      transport_fee: transport_fee || 0,
      total_monthly: totalMonthly,
      monthly_due_day: dueDay,
    },
    tuition_fee: tuition_fee || 0,
    activity_fee: activity_fee || 0,
    transport_fee: transport_fee || 0,
    total_amount: totalMonthly,
    due_date: dueDate,
    fee_period: {
      start_date: new Date(month + '-01'),
      end_date: new Date(new Date(month + '-01').setMonth(new Date(month + '-01').getMonth() + 1) - 1),
      month: month,
    },
    fee_plan: 'Monthly',
    is_recurring: true,
    generated_for_month: month,
  });
  
  await invoice.save();
  return invoice;
};

module.exports = mongoose.model('Fee', feeSchema);