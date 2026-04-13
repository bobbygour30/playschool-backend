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
  class_type: {
    type: String,
    enum: ['standard', 'custom'],
    default: 'standard',
  },
  
  // Staff Assignment (Changed from Faculty to Staff)
  assigned_teacher_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    default: null,
  },
  assigned_staff_id: {
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
  
  // Documents Storage (Cloudinary URLs)
  documents: {
    birth_certificate: {
      type: String,
      default: null,
    },
    aadhar_card: {
      type: String,
      default: null,
    },
    parent_aadhar_front: {
      type: String,
      default: null,
    },
    parent_aadhar_back: {
      type: String,
      default: null,
    },
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

// Update timestamp on save
studentSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('Student', studentSchema);