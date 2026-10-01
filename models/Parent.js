const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const parentSchema = new mongoose.Schema({
  // Names: at least one of father/mother/guardian must be present (enforced in routes + UI).
  // Auto-created parents only know the single name entered on the student admission form.
  father_name: { type: String, default: '', trim: true },
  mother_name: { type: String, default: '', trim: true },
  guardian_name: { type: String, default: '', trim: true },

  mobile_number: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  address: { type: String, required: true },

  // A student may only ever belong to ONE parent record
  student_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],

  emergency_contact: { type: String, required: true },

  contact_person_role: {
    type: String,
    required: true,
    enum: ['Father', 'Mother', 'Guardian'],
    default: 'Father',
  },

  // Login credentials — email is the login id.
  // Password is OPTIONAL now: auto-created parents have none until an admin sets one.
  password: { type: String, default: null },
  login_enabled: { type: Boolean, default: false },

  // Where did this record come from?
  auto_created: { type: Boolean, default: false },
  source: {
    type: String,
    enum: ['manual', 'student_registration', 'migration'],
    default: 'manual',
  },

  status: { type: String, enum: ['Active', 'Inactive', 'Suspended'], default: 'Active' },

  profile_picture: { type: String, default: null },
  notes: { type: String, default: '' },

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

// Hash password (only when one is provided and changed) and keep login_enabled in sync
parentSchema.pre('save', async function (next) {
  try {
    this.updated_at = Date.now();
    if (this.password && this.isModified('password')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
    this.login_enabled = !!this.password;
    next();
  } catch (error) {
    next(error);
  }
});

parentSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Parent', parentSchema);