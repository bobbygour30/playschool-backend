// models/Enquiry.js
const mongoose = require('mongoose');

const FOLLOW_UP_STATUSES = [
  'New',
  'Follow Up',
  'Interested',
  'Not Interested',
  'Converted',
];

const KNOWLEDGE_SOURCES = [
  'Online',
  'Instagram',
  'Facebook',
  'Walk-in',
  'Parents Reference',
  'Google Search',
  'Friend / Family',
  'Newspaper',
  'Pamphlet',
  'Other',
];

const followUpEntrySchema = new mongoose.Schema(
  {
    note: { type: String, required: true, trim: true },
    status_at_time: { type: String, enum: FOLLOW_UP_STATUSES, default: 'Follow Up' },
    next_follow_up_date: { type: Date, default: null },
    recorded_by: { type: String, default: 'Admin' },
    recorded_at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const enquirySchema = new mongoose.Schema(
  {
    // ---- Student (prospective) ----
    student_name: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
    },
    student_dob: { type: Date, default: null },
    student_gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', ''],
      default: '',
    },
    class_interested: {
      type: String,
      enum: ['playgroup', 'nursery', 'lkg', 'ukg', ''],
      default: '',
    },

    // ---- Parent / Guardian ----
    parent_name: {
      type: String,
      required: [true, 'Parent name is required'],
      trim: true,
    },
    parent_relationship: {
      type: String,
      enum: ['Father', 'Mother', 'Guardian'],
      default: 'Father',
    },
    parent_phone: {
      type: String,
      required: [true, 'Parent phone is required'],
      trim: true,
      validate: {
        validator: (v) => /^\d{10}$/.test(v),
        message: 'Parent phone must be exactly 10 digits',
      },
    },
    parent_email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    address: { type: String, default: '', trim: true },

    // ---- Enquiry meta ----
    enquiry_date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    first_visit_date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    knowledge_source: {
      type: String,
      enum: KNOWLEDGE_SOURCES,
      required: [true, 'Please select how you know about our school'],
    },
    knowledge_source_other: { type: String, default: '', trim: true },

    // ---- Status & Follow-up ----
    status: {
      type: String,
      enum: FOLLOW_UP_STATUSES,
      default: 'New',
      index: true,
    },
    last_follow_up_date: { type: Date, default: null },
    next_follow_up_date: { type: Date, default: null },
    follow_up_history: [followUpEntrySchema],

    // ---- Conversion ----
    converted_student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    converted_at: { type: Date, default: null },

    // ---- Misc ----
    notes: { type: String, default: '', trim: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
  }
);

// Indexes for common lookups
enquirySchema.index({ status: 1, last_follow_up_date: -1 });
enquirySchema.index({ parent_phone: 1 });
enquirySchema.index({ student_name: 'text', parent_name: 'text' });

// Virtual: is the next follow-up overdue?
enquirySchema.virtual('is_follow_up_overdue').get(function () {
  if (!this.next_follow_up_date) return false;
  if (['Converted', 'Not Interested'].includes(this.status)) return false;
  return new Date(this.next_follow_up_date) < new Date();
});

enquirySchema.set('toJSON', { virtuals: true });
enquirySchema.set('toObject', { virtuals: true });

enquirySchema.statics.FOLLOW_UP_STATUSES = FOLLOW_UP_STATUSES;
enquirySchema.statics.KNOWLEDGE_SOURCES = KNOWLEDGE_SOURCES;

module.exports = mongoose.model('Enquiry', enquirySchema);