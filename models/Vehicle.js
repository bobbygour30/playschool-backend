const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  vehicle_number: {
    type: String,
    required: true,
    unique: true,
  },
  vehicle_type: {
    type: String,
    enum: ['Bus', 'Van'],
    required: true,
  },
  driver_name: {
    type: String,
    required: true,
  },
  driver_phone: {
    type: String,
    required: true,
  },
  capacity: {
    type: Number,
    required: true,
    default: 10,
  },
  route: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Maintenance', 'Inactive'],
    default: 'Active',
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

vehicleSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('Vehicle', vehicleSchema);