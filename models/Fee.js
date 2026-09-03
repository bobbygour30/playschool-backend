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
  
  due_date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Overdue'],
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
  
  // Additional info
  notes: {
    type: String,
    default: '',
  },
  receipt_url: {
    type: String,
    default: null,
  },
  
  // Audit fields
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

// Update timestamp on save
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
  next();
});

module.exports = mongoose.model('Fee', feeSchema);