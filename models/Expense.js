const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
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
  },
  date: {
    type: Date,
    required: true,
  },
  vendor_name: {
    type: String,
    default: '',
  },
  bill_number: {
    type: String,
    default: '',
  },
  payment_mode: {
    type: String,
    enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Online'],
    default: 'Cash',
  },
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

expenseSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Index for faster queries
expenseSchema.index({ category: 1, date: 1, vendor_name: 'text' });

module.exports = mongoose.model('Expense', expenseSchema);