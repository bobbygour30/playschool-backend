const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  class_id: {
    type: String,
    required: true,
    enum: ['toddler', 'pre-nursery', 'nursery', 'kg-1'],
  },
  month: {
    type: Number,
    required: true,
    min: 0,
    max: 11,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  file_name: {
    type: String,
    required: true,
  },
  file_type: {
    type: String,
    required: true,
  },
  file_url: {
    type: String,
    required: true,
  },
  file_size: {
    type: String,
    default: '',
  },
  uploaded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
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

documentSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Index for faster queries
documentSchema.index({ class_id: 1, month: 1 });
documentSchema.index({ class_id: 1, month: 1, title: 'text' });

module.exports = mongoose.model('Document', documentSchema);