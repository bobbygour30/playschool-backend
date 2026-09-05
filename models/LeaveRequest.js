// models/LeaveRequest.js
const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
  // User Information
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'user_type_model',
  },
  user_type: {
    type: String,
    required: true,
    enum: ['faculty', 'student'],
  },
  user_type_model: {
    type: String,
    required: true,
    enum: ['Faculty', 'Student'],
  },
  
  // Leave Details
  leave_type: {
    type: String,
    required: true,
    enum: ['sick', 'casual', 'earned', 'study', 'other'],
  },
  from_date: {
    type: Date,
    required: true,
  },
  to_date: {
    type: Date,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  
  // Class Assignment
  assigned_class: {
    type: String,
    enum: ['Toddler', 'Pre-Nursery', 'Nursery', 'KG-1', null],
    default: null,
  },
  assigned_section: {
    type: String,
    default: null,
  },
  
  // Substitute Teacher
  substitute_teacher_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    default: null,
  },
  substitute_teacher_name: {
    type: String,
    default: null,
  },
  
  // Approval Details
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
  },
  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  approved_by_name: {
    type: String,
    default: null,
  },
  approved_at: {
    type: Date,
    default: null,
  },
  rejection_reason: {
    type: String,
    default: null,
  },
  
  // Additional Info
  substitute_notes: {
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

// Update timestamp on save
leaveRequestSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Indexes for faster queries
leaveRequestSchema.index({ user_id: 1, user_type: 1 });
leaveRequestSchema.index({ status: 1 });
leaveRequestSchema.index({ from_date: 1, to_date: 1 });
leaveRequestSchema.index({ assigned_class: 1 });
leaveRequestSchema.index({ leave_type: 1 });

// Virtual for duration
leaveRequestSchema.virtual('duration_days').get(function() {
  const from = new Date(this.from_date);
  const to = new Date(this.to_date);
  const diffTime = Math.abs(to - from);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
});

// Virtual for user details (populated)
leaveRequestSchema.virtual('user_details', {
  refPath: 'user_type_model',
  localField: 'user_id',
  foreignField: '_id',
  justOne: true,
});

// Method to check if leave is active (current date within range)
leaveRequestSchema.methods.isActive = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = new Date(this.from_date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(this.to_date);
  to.setHours(0, 0, 0, 0);
  return today >= from && today <= to;
};

// Static method to get pending count
leaveRequestSchema.statics.getPendingCount = async function() {
  return await this.countDocuments({ status: 'pending' });
};

// Static method to get today's leaves
leaveRequestSchema.statics.getTodayLeaves = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return await this.find({
    from_date: { $lte: tomorrow },
    to_date: { $gte: today },
    status: 'approved',
  }).populate('user_details').populate('substitute_teacher_id');
};

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);