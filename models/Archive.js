// models/Archive.js  (REPLACE)
const mongoose = require('mongoose');

const archiveSchema = new mongoose.Schema({
  // What kind of record this is
  entity_type: {
    type: String,
    enum: ['Student', 'Fee', 'Expense', 'Salary'],
    required: true,
    index: true,
  },

  // The original document's _id
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },

  // Full snapshot of the original document (so we can restore it)
  snapshot: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },

  // Human-friendly label for the UI list
  label: { type: String, default: '' },

  // ---- Archive / void reason ----
  // No enum here on purpose: each entity type has its own allowed list, which is
  // validated in routes/archives.js (REASONS_BY_ENTITY).
  archive_reason_type: { type: String, default: '' },
  // Display text: for "Other" it's the typed reason, otherwise a composed string
  archive_reason: { type: String, default: '' },

  // ---- Who archived / voided it ----
  archived_by: { type: String, default: null },
  archived_by_name: { type: String, default: '' },

  // How it was archived:
  //   manual  = admin voided this record directly
  //   student = archived together with its student
  //   staff   = archived because the staff member was removed
  archive_source: {
    type: String,
    enum: ['manual', 'student', 'staff'],
    default: 'manual',
  },

  // Permanent delete audit (students only — finance can never be permanently deleted)
  permanent_delete_reason: { type: String, default: '' },
  permanently_deleted_at: { type: Date, default: null },

  archived_at: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

archiveSchema.index({ entity_type: 1, archived_at: -1 });

module.exports = mongoose.models.Archive || mongoose.model('Archive', archiveSchema);