const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
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
    type: String, // Changed from ObjectId to String to accept both standard and custom classes
    default: null,
  },
  class_type: {
    type: String,
    enum: ['standard', 'custom'],
    default: 'standard',
  },
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
  enrollment_date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Graduated'],
    default: 'Active',
  },
  vehicle_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Student', studentSchema);