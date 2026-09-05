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
holidaySchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Index for faster queries
holidaySchema.index({ date: 1 });
holidaySchema.index({ type: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);