const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  child_name: {
    type: String,
    required: true,
  },
  child_age: {
    type: Number,
    required: true,
  },
  parent_name: {
    type: String,
    required: true,
  },
  parent_email: {
    type: String,
    required: true,
  },
  parent_phone: {
    type: String,
    required: true,
  },
  interested_class: {
    type: String,
    required: true,
  },
  source: {
    type: String,
    enum: ['Walk-in', 'Website', 'Referral', 'Social Media', 'Advertisement', 'Other'],
    default: 'Walk-in',
  },
  status: {
    type: String,
    enum: ['New', 'Contacted', 'Converted', 'Lost'],
    default: 'New',
  },
  notes: {
    type: String,
    default: '',
  },
  follow_up_date: {
    type: Date,
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Lead', leadSchema);