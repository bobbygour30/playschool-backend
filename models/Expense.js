// models/Expense.js  (REPLACE)
const mongoose = require('mongoose');
const Counter = require('./Counter');   // your EXISTING Counter model (same one Fee.js uses)
const auditFields = require('../utils/auditFields');

const expenseSchema = new mongoose.Schema({
  // Auto-generated, human-friendly ID, e.g. EXP-2026-0001
  expense_id: {
    type: String,
    trim: true,
    index: { unique: true, sparse: true },
  },
  category: {
    type: String,
    required: true,
    enum: ['Maintenance', 'Utilities', 'Stationery', 'Events', 'Transport', 'Salary', 'Other'],
  },
  description: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: [0.01, 'Amount must be greater than zero'],
  },
  // Expense date
  date: {
    type: Date,
    required: true,
  },
  // Vendor / Payee
  vendor_name: {
    type: String,
    default: '',
  },
  // Receipt / Invoice no.
  bill_number: {
    type: String,
    default: '',
  },
  // Payment method (field name kept as payment_mode so existing data keeps working)
  payment_mode: {
    type: String,
    enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'UPI', 'Online'],
    default: 'Cash',
  },
  // Attachment / receipt
  receipt_url: {
    type: String,
    default: null,
  },
  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    default: null,
  },
  notes: {
    type: String,
    default: '',
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
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

// Adds created_by_name, last_modified_by, last_modified_by_name, last_modified_at
auditFields(expenseSchema);

// Next Expense ID for a year: EXP-2026-0001, EXP-2026-0002 ...
expenseSchema.statics.nextExpenseId = async function (forDate = new Date()) {
  const year = forDate.getFullYear();
  const c = await Counter.findByIdAndUpdate(
    `expense-${year}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const n = c.seq;
  return `EXP-${year}-${String(n).padStart(4, '0')}`;
};

// Assign the ID on first save (async hook without `next` — Mongoose awaits the promise)
expenseSchema.pre('validate', async function () {
  if (this.isNew && !this.expense_id) {
    this.expense_id = await this.constructor.nextExpenseId();
  }
});

expenseSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

// Index for faster queries
expenseSchema.index({ category: 1, date: 1, vendor_name: 'text' });

module.exports = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);