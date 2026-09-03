const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const parentSchema = new mongoose.Schema({
  // Personal Information — Father & Mother names captured separately
  father_name: { type: String, required: true, trim: true },
  mother_name: { type: String, required: true, trim: true },

  mobile_number: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  address: { type: String, required: true },

  // Student Links — a student may only ever belong to ONE parent record
  student_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],

  // Emergency Contact
  emergency_contact: { type: String, required: true },

  // Contact Person Role — who is the primary point of contact for this account.
  // Intentionally placed after emergency_contact to match the registration form flow.
  contact_person_role: {
    type: String,
    required: true,
    enum: ['Father', 'Mother', 'Guardian'],
    default: 'Father',
  },

  // Login Credentials — username removed, email is the login identifier now
  password: { type: String, required: true },

  // Status
  status: { type: String, enum: ['Active', 'Inactive', 'Suspended'], default: 'Active' },

  // Additional Info
  profile_picture: { type: String, default: null },
  notes: { type: String, default: '' },

  // Unlink audit trail — every time a student is removed from this parent,
  // an admin-supplied reason is recorded here.
  unlink_history: [{
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    student_name: { type: String, default: '' },
    reason: { type: String, required: true },
    unlinked_at: { type: Date, default: Date.now },
  }],

  // Sync fields
  sync_status: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
  sync_attempts: { type: Number, default: 0 },
  synced_at: { type: Date, default: null },
  sync_error: { type: String, default: null },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Hash password before saving
parentSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.updated_at = Date.now();
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
parentSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Parent', parentSchema);