const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema({
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
  subject: {
    type: String,
    required: true,
  },
  marks: {
    type: String,
    default: 'Pending',
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

assessmentSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('Assessment', assessmentSchema);