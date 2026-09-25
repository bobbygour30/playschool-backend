// routes/achievementRoutes.js
const express = require('express');
const router = express.Router();
const Achievement = require('../models/Achievement');
const Student = require('../models/Student');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const { notifyAchievementAdded } = require('../utils/notificationHelper');

const CATEGORIES = ['Academic', 'Sports', 'Arts & Craft', 'Behavior', 'Attendance', 'Leadership', 'Extracurricular', 'Other'];
const LEVELS = ['Classroom', 'School', 'Inter-School', 'District', 'State', 'National'];

router.get('/meta/options', (req, res) => {
  res.json({ success: true, categories: CATEGORIES, levels: LEVELS });
});

// GET all achievements (filterable) — used for an "All achievements" admin feed
router.get('/', async (req, res) => {
  try {
    const { student_id, category, level, from, to, page = 1, limit = 30 } = req.query;
    let query = {};
    if (student_id) query.student_id = student_id;
    if (category && category !== 'all') query.category = category;
    if (level && level !== 'all') query.level = level;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [achievements, total] = await Promise.all([
      Achievement.find(query)
        .populate('student_id', 'name class_id section')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Achievement.countDocuments(query),
    ]);

    res.json({ success: true, data: achievements, total, page: parseInt(page) });
  } catch (error) {
    console.error('Error fetching achievements:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET achievement chain/timeline for one student, with rollup stats
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId).select('name class_id section documents');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const achievements = await Achievement.find({ student_id: studentId }).sort({ date: -1 });

    const byCategory = {};
    let totalPoints = 0;
    achievements.forEach((a) => {
      byCategory[a.category] = (byCategory[a.category] || 0) + 1;
      totalPoints += a.points || 0;
    });

    res.json({
      success: true,
      data: {
        student,
        achievements,
        stats: {
          total: achievements.length,
          totalPoints,
          byCategory,
          milestones: achievements.filter((a) => a.is_milestone).length,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching student achievements:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== CREATE ====================

router.post('/', async (req, res) => {
  try {
    const {
      student_id, title, category, description, date, level,
      awarded_by, points, badge_color, certificate, photo, is_milestone, created_by,
    } = req.body;

    if (!student_id || !title) {
      return res.status(400).json({ success: false, message: 'Student and title are required' });
    }

    const student = await Student.findById(student_id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    let certificate_url = null;
    let photo_url = null;
    if (certificate) certificate_url = await uploadToCloudinary(certificate, 'students/achievements/certificates');
    if (photo) photo_url = await uploadToCloudinary(photo, 'students/achievements/photos');

    const achievement = new Achievement({
      student_id,
      title,
      category: CATEGORIES.includes(category) ? category : 'Other',
      description: description || '',
      date: date ? new Date(date) : new Date(),
      level: LEVELS.includes(level) ? level : 'Classroom',
      awarded_by: awarded_by || '',
      points: parseInt(points) || 0,
      badge_color: badge_color || '#F59E0B',
      certificate_url,
      photo_url,
      is_milestone: !!is_milestone,
      created_by: created_by || null,
    });

    await achievement.save();

    // Best-effort — never block the response on a notification failure.
    notifyAchievementAdded(achievement, student.name);

    res.status(201).json({ success: true, message: 'Achievement added successfully', data: achievement });
  } catch (error) {
    console.error('Error creating achievement:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== UPDATE ====================

router.put('/:id', async (req, res) => {
  try {
    const existing = await Achievement.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Achievement not found' });

    const {
      title, category, description, date, level,
      awarded_by, points, badge_color, certificate, photo, is_milestone,
    } = req.body;

    let certificate_url = existing.certificate_url;
    if (certificate && certificate !== existing.certificate_url) {
      if (existing.certificate_url) await deleteFromCloudinary(existing.certificate_url);
      certificate_url = await uploadToCloudinary(certificate, 'students/achievements/certificates');
    }

    let photo_url = existing.photo_url;
    if (photo && photo !== existing.photo_url) {
      if (existing.photo_url) await deleteFromCloudinary(existing.photo_url);
      photo_url = await uploadToCloudinary(photo, 'students/achievements/photos');
    }

    Object.assign(existing, {
      title: title ?? existing.title,
      category: CATEGORIES.includes(category) ? category : existing.category,
      description: description ?? existing.description,
      date: date ? new Date(date) : existing.date,
      level: LEVELS.includes(level) ? level : existing.level,
      awarded_by: awarded_by ?? existing.awarded_by,
      points: points !== undefined ? parseInt(points) || 0 : existing.points,
      badge_color: badge_color ?? existing.badge_color,
      certificate_url,
      photo_url,
      is_milestone: is_milestone !== undefined ? !!is_milestone : existing.is_milestone,
      updated_at: Date.now(),
    });

    await existing.save();
    res.json({ success: true, message: 'Achievement updated successfully', data: existing });
  } catch (error) {
    console.error('Error updating achievement:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== DELETE ====================

router.delete('/:id', async (req, res) => {
  try {
    const achievement = await Achievement.findById(req.params.id);
    if (!achievement) return res.status(404).json({ success: false, message: 'Achievement not found' });

    if (achievement.certificate_url) await deleteFromCloudinary(achievement.certificate_url);
    if (achievement.photo_url) await deleteFromCloudinary(achievement.photo_url);

    await Achievement.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Achievement deleted successfully' });
  } catch (error) {
    console.error('Error deleting achievement:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;