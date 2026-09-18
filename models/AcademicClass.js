const mongoose = require('mongoose');

const academicClassSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['Playgroup', 'Nursery', 'LKG', 'UKG'],
  },
  class_id: {
    type: String,
    required: true,
    unique: true,
    enum: ['playgroup', 'nursery', 'lkg', 'ukg'],
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