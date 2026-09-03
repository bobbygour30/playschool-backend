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
  blood_group: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    default: '',
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
  parent_relationship: {
    type: String,
    enum: ['Mother', 'Father', 'Guardian'],
    default: 'Mother',
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
  
  // Fee and Charges Information - Updated with all fee types
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
  cab_fee: {
    type: Number,
    default: 0,
  },
  camera_fee: {
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
    enum: ['Cab', 'Walker', 'Bus'],
    default: 'Walker',
  },
  vehicle_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null,
  },
  vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null,
  },
  
  // Documents Storage - Birth Certificate and Parent Aadhar are mandatory
  documents: {
    birth_certificate: { 
      type: String, 
      required: true,
      default: null 
    },
    aadhar_card: { 
      type: String, 
      default: null 
    },
    parent_aadhar_front: { 
      type: String, 
      required: true,
      default: null 
    },
    parent_aadhar_back: { 
      type: String, 
      required: true,
      default: null 
    },
  },
  
  // Promotion audit trail — records every class change made by the
  // "Promote Students" bulk action, for history/reporting purposes.
  promotion_history: [{
    from_class: { type: String, default: '' },
    to_class: { type: String, default: '' }, // 'Graduated' when the student completes KG-1
    academic_year: { type: String, default: '' },
    promoted_at: { type: Date, default: Date.now },
  }],
  
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Update timestamp on save
studentSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  // Auto-calculate total amount from all fee components
  this.total_amount = 
    (this.registration_fee || 0) + 
    (this.admission_fee || 0) + 
    (this.tuition_fee || 0) + 
    (this.activity_fee || 0) + 
    (this.kit_fee || 0) + 
    (this.cab_fee || 0) + 
    (this.camera_fee || 0);
  next();
});

// Pre-update middleware to calculate total
studentSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.registration_fee !== undefined || 
      update.admission_fee !== undefined || 
      update.tuition_fee !== undefined || 
      update.activity_fee !== undefined || 
      update.kit_fee !== undefined || 
      update.cab_fee !== undefined || 
      update.camera_fee !== undefined) {
    const reg = update.registration_fee || 0;
    const adm = update.admission_fee || 0;
    const tui = update.tuition_fee || 0;
    const act = update.activity_fee || 0;
    const kit = update.kit_fee || 0;
    const cab = update.cab_fee || 0;
    const cam = update.camera_fee || 0;
    update.total_amount = reg + adm + tui + act + kit + cab + cam;
  }
  next();
});

module.exports = mongoose.model('Student', studentSchema);