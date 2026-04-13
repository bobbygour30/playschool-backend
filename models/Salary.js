const mongoose = require('mongoose');

const salarySchema = new mongoose.Schema({
  staff_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true,
  },
  month: {
    type: Date,
    required: true,
  },
  basic_salary: {
    type: Number,
    required: true,
  },
  allowance: {
    type: Number,
    default: 0,
  },
  deductions: {
    type: Number,
    default: 0,
  },
  net_salary: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Cancelled'],
    default: 'Pending',
  },
  payment_date: {
    type: Date,
    default: null,
  },
  payment_method: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Cheque'],
    default: 'Bank Transfer',
  },
  transaction_id: {
    type: String,
    default: '',
  },
  remarks: {
    type: String,
    default: '',
  },
  salary_slip_url: {
    type: String,
    default: null,
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

salarySchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Index for faster queries
salarySchema.index({ staff_id: 1, month: 1, status: 1 });

// Compound unique index to prevent duplicate salary entries for same staff in same month
salarySchema.index({ staff_id: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Salary', salarySchema);