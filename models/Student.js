// models/Student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
  },
  date_of_birth: {
    type: Date,
    required: true,
  },
  gender: {
    type: String,
    required: true,
    enum: ['Male', 'Female'],
  },
  class_id: {
    type: String,
    default: null,
  },
  section: {
    type: String,
    default: 'A',
    uppercase: true,
    enum: ['A', 'B', 'C', 'D'],
  },
  class_type: {
    type: String,
    enum: ['standard', 'custom'],
    default: 'standard',
  },
  
  // Staff Assignment
  assigned_teacher_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    default: null,
  },
  
  // Parent Information
  parent_name: {
    type: String,
    required: true,
  },
  parent_email: {
    type: String,
    required: true,
  },
  parent_phone: {
    type: String,
    required: true,
  },
  parent_aadhar: {
    type: String,
    default: '',
  },
  
  // Contact Information
  address: {
    type: String,
    required: true,
  },
  emergency_contact: {
    type: String,
    required: true,
  },
  medical_info: {
    type: String,
    default: '',
  },
  
  // Academic Information
  enrollment_date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Graduated'],
    default: 'Active',
  },
  
  // Fee and Charges Information
  fee_amount: {
    type: Number,
    default: 0,
  },
  kit_charges: {
    type: Number,
    default: 0,
  },
  total_amount: {
    type: Number,
    default: 0,
  },
  fee_paid: {
    type: Boolean,
    default: false,
  },
  payment_date: {
    type: Date,
    default: null,
  },
  payment_mode: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'],
    default: 'Cash',
  },
  
  // Transport Information
  transport_type: {
    type: String,
    enum: ['Cab', 'Walker'],
    default: 'Walker',
  },
  vehicle_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null,
  },
  
  // Documents Storage
  documents: {
    birth_certificate: { type: String, default: null },
    aadhar_card: { type: String, default: null },
    parent_aadhar_front: { type: String, default: null },
    parent_aadhar_back: { type: String, default: null },
  },
  
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Update timestamp on save
studentSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  // Auto-calculate total amount
  if (this.fee_amount !== undefined || this.kit_charges !== undefined) {
    this.total_amount = (this.fee_amount || 0) + (this.kit_charges || 0);
  }
  next();
});

// Pre-update middleware to calculate total
studentSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.fee_amount !== undefined || update.kit_charges !== undefined) {
    const fee = update.fee_amount || 0;
    const kit = update.kit_charges || 0;
    update.total_amount = fee + kit;
  }
  next();
});

module.exports = mongoose.model('Student', studentSchema);