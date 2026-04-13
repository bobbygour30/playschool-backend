const mongoose = require('mongoose');

const feeSchema = new mongoose.Schema({
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  admission_fee: {
    type: Number,
    default: 0,
  },
  tuition_fee: {
    type: Number,
    default: 0,
  },
  transport_fee: {
    type: Number,
    default: 0,
  },
  activity_fee: {
    type: Number,
    default: 0,
  },
  total_amount: {
    type: Number,
    required: true,
  },
  due_date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Paid', 'Pending', 'Overdue', 'Partial'],
    default: 'Pending',
  },
  payment_date: {
    type: Date,
    default: null,
  },
  payment_method: {
    type: String,
    enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Online'],
    default: 'Cash',
  },
  transaction_id: {
    type: String,
    default: '',
  },
  notes: {
    type: String,
    default: '',
  },
  receipt_url: {
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

feeSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Index for faster queries
feeSchema.index({ student_id: 1, status: 1, due_date: 1 });

module.exports = mongoose.model('Fee', feeSchema);