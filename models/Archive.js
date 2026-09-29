// models/Archive.js
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

  // Human-friendly label for the UI list (e.g. student name, invoice #)
  label: { type: String, default: '' },

  // Why it was archived
  archive_reason: { type: String, default: '' },

  // Who archived it (optional)
  archived_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Permanent delete audit
  permanent_delete_reason: { type: String, default: '' },
  permanently_deleted_at: { type: Date, default: null },

  archived_at: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

archiveSchema.index({ entity_type: 1, archived_at: -1 });

module.exports = mongoose.models.Archive || mongoose.model('Archive', archiveSchema);