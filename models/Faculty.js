const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  phone: {
    type: String,
    required: true,
  },
  designation: {
    type: String,
    required: true,
  },
  class_id: {
    type: String, // Changed from ObjectId to String to accept standard class IDs
    default: null,
  },
  class_type: {
    type: String,
    enum: ['standard', 'custom'],
    default: 'standard',
  },
  date_of_joining: {
    type: Date,
    required: true,
  },
  salary: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Faculty', facultySchema);