// models/LeaveSettings.js
const mongoose = require('mongoose');

const leaveSettingsSchema = new mongoose.Schema({
  // Academic Calendar
  term_start: {
    type: Date,
    default: null,
  },
  term_end: {
    type: Date,
    default: null,
  },
  
  // Leave Type Limits (per year)
  leave_limits: {
    sick: {
      max_days: { type: Number, default: 12 },
      requires_document: { type: Boolean, default: true },
    },
    casual: {
      max_days: { type: Number, default: 6 },
      requires_document: { type: Boolean, default: false },
    },
    earned: {
      max_days: { type: Number, default: 15 },
      requires_document: { type: Boolean, default: false },
    },
    study: {
      max_days: { type: Number, default: 5 },
      requires_document: { type: Boolean, default: true },
    },
    other: {
      max_days: { type: Number, default: 3 },
      requires_document: { type: Boolean, default: false },
    },
  },
  
  // Holiday Settings
  holiday_settings: {
    show_weekends: { type: Boolean, default: true },
    auto_approve_holidays: { type: Boolean, default: false },
  },
  
  // Notification Settings
  notifications: {
    faculty_leave_alert: { type: Boolean, default: true },
    student_leave_alert: { type: Boolean, default: true },
    substitute_assignment_alert: { type: Boolean, default: true },
  },
  
  // Update Settings
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Update timestamp on save
leaveSettingsSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('LeaveSettings', leaveSettingsSchema);