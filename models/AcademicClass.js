const mongoose = require('mongoose');

const academicClassSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['Toddler', 'Pre-Nursery', 'Nursery', 'KG-1'],
  },
  class_id: {
    type: String,
    required: true,
    unique: true,
    enum: ['toddler', 'pre-nursery', 'nursery', 'kg-1'],
  },
  age_group: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('AcademicClass', academicClassSchema);