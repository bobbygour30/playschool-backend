// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },

  type: {
    type: String,
    enum: ['leave', 'holiday', 'fee', 'expense', 'salary', 'achievement', 'general'],
    default: 'general',
  },

  category: {
    type: String,
    enum: ['info', 'success', 'warning', 'alert'],
    default: 'info',
  },

  // Who this notification is meant for. 'admin' = the school office / dashboard feed.
  audience: {
    type: String,
    enum: ['admin', 'faculty', 'parent', 'all'],
    default: 'admin',
  },

  // Optional: target a specific person (e.g. a parent or a teacher) rather than the whole audience.
  recipient_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  recipient_model: { type: String, enum: ['Staff', 'Student', null], default: null },

  // Link back to the record that triggered this notification.
  related_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  related_type: { type: String, default: null }, // 'LeaveRequest' | 'Fee' | 'Achievement' | 'Holiday' | etc.

  // Where the frontend should navigate to when the notification is clicked.
  action_url: { type: String, default: '' },

  is_read: { type: Boolean, default: false },
  read_at: { type: Date, default: null },

  priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },

  created_at: { type: Date, default: Date.now },
});

notificationSchema.index({ audience: 1, is_read: 1, created_at: -1 });
notificationSchema.index({ related_id: 1, related_type: 1 });

module.exports = mongoose.model('Notification', notificationSchema);