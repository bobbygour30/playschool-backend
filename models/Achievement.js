// models/Achievement.js
const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },

  title: { type: String, required: true },

  category: {
    type: String,
    enum: ['Academic', 'Sports', 'Arts & Craft', 'Behavior', 'Attendance', 'Leadership', 'Extracurricular', 'Other'],
    default: 'Other',
  },

  description: { type: String, default: '' },

  date: { type: Date, required: true, default: Date.now },

  level: {
    type: String,
    enum: ['Classroom', 'School', 'Inter-School', 'District', 'State', 'National'],
    default: 'Classroom',
  },

  awarded_by: { type: String, default: '' }, // teacher / organization name
  points: { type: Number, default: 0 },      // optional gamification score
  badge_color: { type: String, default: '#F59E0B' },

  certificate_url: { type: String, default: null }, // Cloudinary
  photo_url: { type: String, default: null },        // Cloudinary

  is_milestone: { type: Boolean, default: false }, // highlighted on the chain, e.g. "100 days perfect attendance"

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

achievementSchema.index({ student_id: 1, date: -1 });
achievementSchema.index({ category: 1 });

module.exports = mongoose.model('Achievement', achievementSchema);