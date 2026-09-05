// models/Faculty.js
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
  
  // NEW: Class mappings for multiple class assignments
  class_mappings: [{
    class_name: {
      type: String,
      enum: ['Toddler', 'Pre-Nursery', 'Nursery', 'KG-1'],
    },
    section: {
      type: String,
      default: 'A',
    },
    subject: {
      type: String,
      default: '',
    },
  }],
  
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
  
  // NEW: Leave balance tracking
  leave_balances: {
    sick: {
      total: { type: Number, default: 12 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 12 },
    },
    casual: {
      total: { type: Number, default: 6 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 6 },
    },
    earned: {
      total: { type: Number, default: 15 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 15 },
    },
    study: {
      total: { type: Number, default: 5 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 5 },
    },
    other: {
      total: { type: Number, default: 3 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 3 },
    },
  },
  
  // NEW: Substitute teaching assignments (as substitute teacher)
  substitute_assignments: [{
    leave_request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaveRequest',
    },
    date: Date,
    class_name: String,
    section: String,
    subject: String,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'completed', 'declined'],
      default: 'pending',
    },
    notes: String,
    assigned_at: {
      type: Date,
      default: Date.now,
    },
  }],
  
  // NEW: Holiday/Leave preferences
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
    },
    substitute_preferences: {
      preferred_classes: [String],
      available_days: {
        monday: { type: Boolean, default: true },
        tuesday: { type: Boolean, default: true },
        wednesday: { type: Boolean, default: true },
        thursday: { type: Boolean, default: true },
        friday: { type: Boolean, default: true },
        saturday: { type: Boolean, default: false },
        sunday: { type: Boolean, default: false },
      },
    },
  },
  
  // Sync fields
  sync_status: {
    type: String,
    enum: ['pending', 'synced', 'failed'],
    default: 'pending',
  },
  sync_attempts: {
    type: Number,
    default: 0,
  },
  synced_at: {
    type: Date,
    default: null,
  },
  sync_error: {
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

// NEW: Method to calculate leave balance for a specific type
facultySchema.methods.calculateLeaveBalance = function(leaveType) {
  const balance = this.leave_balances[leaveType];
  if (!balance) return { total: 0, used: 0, remaining: 0 };
  
  const used = balance.used || 0;
  const total = balance.total || 0;
  return {
    total,
    used,
    remaining: total - used,
  };
};

// NEW: Method to deduct leave days
facultySchema.methods.deductLeave = async function(leaveType, days) {
  const balance = this.leave_balances[leaveType];
  if (!balance) return { success: false, message: 'Invalid leave type' };
  
  const available = balance.total - balance.used;
  if (available < days) {
    return { success: false, message: 'Insufficient leave balance' };
  }
  
  balance.used += days;
  balance.remaining = balance.total - balance.used;
  await this.save();
  return { success: true, remaining: balance.remaining };
};

// NEW: Method to add leave days (for carryover or adjustments)
facultySchema.methods.addLeave = async function(leaveType, days, isCarryover = false) {
  const balance = this.leave_balances[leaveType];
  if (!balance) return { success: false, message: 'Invalid leave type' };
  
  balance.total += days;
  balance.remaining = balance.total - balance.used;
  
  if (isCarryover) {
    balance.carryover = (balance.carryover || 0) + days;
  }
  
  await this.save();
  return { success: true, remaining: balance.remaining };
};

// NEW: Method to check if faculty is on leave on a specific date
facultySchema.methods.isOnLeaveOnDate = async function(date) {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  
  const LeaveRequest = mongoose.model('LeaveRequest');
  const leave = await LeaveRequest.findOne({
    user_id: this._id,
    user_type: 'faculty',
    status: 'approved',
    from_date: { $lte: targetDate },
    to_date: { $gte: targetDate },
  });
  
  return !!leave;
};

// NEW: Method to get faculty's active leaves
facultySchema.methods.getActiveLeaves = async function() {
  const LeaveRequest = mongoose.model('LeaveRequest');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return await LeaveRequest.find({
    user_id: this._id,
    user_type: 'faculty',
    status: 'approved',
    from_date: { $lte: today },
    to_date: { $gte: today },
  });
};

// NEW: Method to get faculty's substitute assignments
facultySchema.methods.getSubstituteAssignments = async function(status) {
  const query = { substitute_teacher_id: this._id };
  if (status) query.status = status;
  
  const LeaveRequest = mongoose.model('LeaveRequest');
  return await LeaveRequest.find(query)
    .populate('user_id')
    .sort({ from_date: 1 });
};

// NEW: Static method to get all faculty available on a date
facultySchema.statics.getAvailableOnDate = async function(date, excludedIds = []) {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  
  // Get faculty on leave
  const LeaveRequest = mongoose.model('LeaveRequest');
  const onLeave = await LeaveRequest.find({
    user_type: 'faculty',
    status: 'approved',
    from_date: { $lte: targetDate },
    to_date: { $gte: targetDate },
  }).distinct('user_id');
  
  const excluded = [...excludedIds, ...onLeave];
  
  return await this.find({
    _id: { $nin: excluded },
    status: 'Active',
  }).select('faculty_name assigned_class subject mobile_number email');
};

// Update timestamp on save
facultySchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Create indexes for better performance
facultySchema.index({ status: 1 });
facultySchema.index({ assigned_class: 1 });
facultySchema.index({ 'substitute_assignments.status': 1 });
facultySchema.index({ 'substitute_assignments.date': 1 });

module.exports = mongoose.model('Faculty', facultySchema);