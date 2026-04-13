const mongoose = require('mongoose');

const culminationSchema = new mongoose.Schema({
  class_id: {
    type: String,
    required: true,
    enum: ['toddler', 'pre-nursery', 'nursery', 'kg-1'],
  },
  title: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['completed', 'upcoming', 'cancelled'],
    default: 'upcoming',
  },
  description: {
    type: String,
    required: true,
  },
  report: {
    type: String,
    default: '',
  },
  attachments: [{
    type: String, // Cloudinary URLs
  }],
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
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

culminationSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('Culmination', culminationSchema);