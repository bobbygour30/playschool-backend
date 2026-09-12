// models/Holiday.js
const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['public', 'academic', 'optional', 'custom'],
    default: 'public',
  },
  description: {
    type: String,
    default: '',
  },
  color: {
    type: String,
    default: '#FF6B6B',
  },
  for_faculty: {
    type: Boolean,
    default: true,
  },
  for_students: {
    type: Boolean,
    default: true,
  },
  affected_classes: [{
    type: String,
    enum: ['Toddler', 'Pre-Nursery', 'Nursery', 'KG-1'],
  }],
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // ===== SYNC FIELDS =====
  sync_status: {
    type: String,
    enum: ['pending', 'synced', 'failed'],
    default: 'pending',
  },
  synced_at: { type: Date, default: null },
  sync_error: { type: String, default: null },
  sync_attempts: { type: Number, default: 0 },
  // ======================
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

holidaySchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

holidaySchema.index({ date: 1 });
holidaySchema.index({ type: 1 });
holidaySchema.index({ sync_status: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);