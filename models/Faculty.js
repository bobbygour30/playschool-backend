const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const facultySchema = new mongoose.Schema({
  // Personal Information
  faculty_name: {
    type: String,
    required: true,
    trim: true,
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
  qualification: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  
  // Professional Information
  assigned_class: {
    type: String,
    required: true,
  },
  assigned_section: {
    type: String,
    default: 'A',
  },
  subject: {
    type: String,
    default: '',
  },
  employee_id: {
    type: String,
    required: true,
    unique: true,
  },
  joining_date: {
    type: Date,
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
    enum: ['Active', 'Inactive', 'On Leave'],
    default: 'Active',
  },
  
  // Additional Info
  profile_picture: {
    type: String,
    default: null,
  },
  experience_years: {
    type: Number,
    default: 0,
  },
  specialization: {
    type: String,
    default: '',
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
facultySchema.pre('save', async function(next) {
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

// Compare password method
facultySchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Faculty', facultySchema);