const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  age_group: {
    type: String,
    required: true,
  },
  capacity: {
    type: Number,
    default: 20,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Class', classSchema);