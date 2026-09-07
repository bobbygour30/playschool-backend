// models/Fee.js
const mongoose = require('mongoose');

const feeSchema = new mongoose.Schema({
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true,
  },
  
  // Fee components (matching student schema)
  registration_fee: {
    type: Number,
    default: 0,
  },
  admission_fee: {
    type: Number,
    default: 0,
  },
  tuition_fee: {
    type: Number,
    default: 0,
  },
  activity_fee: {
    type: Number,
    default: 0,
  },
  kit_fee: {
    type: Number,
    default: 0,
  },
  transport_fee: {
    type: Number,
    default: 0, // Maps to cab_fee from student
  },
  camera_fee: {
    type: Number,
    default: 0,
  },
  total_amount: {
    type: Number,
    default: 0,
  },
  
  // Payment tracking
  paid_amount: {
    type: Number,
    default: 0,
  },
  remaining_amount: {
    type: Number,
    default: 0,
  },
  
  due_date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Overdue', 'Partial'],
    default: 'Pending',
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
  
  // Payment history
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
      enum: ['full', 'partial', 'advance'],
      required: true,
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
  }],
  
  // Additional info
  notes: {
    type: String,
    default: '',
  },
  receipt_url: {
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

// Index for faster queries
feeSchema.index({ student_id: 1, due_date: -1 });
feeSchema.index({ status: 1 });

// Update timestamp and calculate totals on save
feeSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  
  // Auto-calculate total amount
  this.total_amount = 
    (this.registration_fee || 0) + 
    (this.admission_fee || 0) + 
    (this.tuition_fee || 0) + 
    (this.activity_fee || 0) + 
    (this.kit_fee || 0) + 
    (this.transport_fee || 0) + 
    (this.camera_fee || 0);
  
  // Calculate remaining amount
  this.remaining_amount = this.total_amount - (this.paid_amount || 0);
  
  // Update status based on payment
  if (this.remaining_amount <= 0) {
    this.status = 'Paid';
  } else if (this.paid_amount > 0 && this.remaining_amount > 0) {
    this.status = 'Partial';
  }
  
  next();
});

// Method to record a payment
feeSchema.methods.recordPayment = function(paymentData) {
  const { amount, payment_method, transaction_id, payment_type, notes, recorded_by } = paymentData;
  
  // Add to payment history
  this.payment_history.push({
    amount,
    payment_date: new Date(),
    payment_method,
    transaction_id: transaction_id || '',
    payment_type,
    notes: notes || '',
    recorded_by: recorded_by || null,
  });
  
  // Update paid amount
  this.paid_amount = (this.paid_amount || 0) + amount;
  this.remaining_amount = this.total_amount - this.paid_amount;
  
  // Update status
  if (this.remaining_amount <= 0) {
    this.status = 'Paid';
    this.payment_date = new Date();
    this.payment_method = payment_method;
    this.transaction_id = transaction_id || '';
  } else if (this.paid_amount > 0) {
    this.status = 'Partial';
  }
  
  return this.save();
};

module.exports = mongoose.model('Fee', feeSchema);