const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const parentSchema = new mongoose.Schema({
  // Personal Information
  parent_name: {
    type: String,
    required: true,
    trim: true,
  },
  parent_role: {
    type: String,
    required: true,
    enum: ['Father', 'Mother', 'Guardian'],
    default: 'Father',
  },
  mobile_number: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  address: {
    type: String,
    required: true,
  },
  
  // Student Information
  student_name: {
    type: String,
    required: true,
  },
  student_dob: {
    type: Date,
    required: true,
  },
  student_age: {
    type: Number,
    default: 0,
  },
  class_grade: {
    type: String,
    required: true,
  },
  
  // Emergency Contact
  emergency_contact: {
    type: String,
    required: true,
  },
  
  // Login Credentials
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  
  // Status
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Suspended'],
    default: 'Active',
  },
  
  // Additional Info
  profile_picture: {
    type: String,
    default: null,
  },
  notes: {
    type: String,
    default: '',
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

// Hash password before saving
parentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.updated_at = Date.now();
    next();
  } catch (error) {
    next(error);
  }
});

// Calculate age from DOB
parentSchema.pre('save', function(next) {
  if (this.student_dob) {
    const today = new Date();
    const birthDate = new Date(this.student_dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    this.student_age = age;
  }
  next();
});

// Compare password method
parentSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Parent', parentSchema);