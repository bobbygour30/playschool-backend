// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const LeaveRequest = require('../models/LeaveRequest');
const { notifyLeaveOnDay } = require('../utils/notificationHelper');

// ==================== LIST / UNREAD COUNT ====================

router.get('/', async (req, res) => {
  try {
    const { audience = 'admin', is_read, type, limit = 30, page = 1 } = req.query;
    let query = { audience };
    if (is_read !== undefined) query.is_read = is_read === 'true';
    if (type) query.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query).sort({ created_at: -1 }).skip(skip).limit(parseInt(limit)),
      Notification.countDocuments(query),
      Notification.countDocuments({ audience, is_read: false }),
    ]);

    res.json({ success: true, data: notifications, total, unreadCount, page: parseInt(page) });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    const { audience = 'admin' } = req.query;
    const count = await Notification.countDocuments({ audience, is_read: false });
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== READ / DELETE ====================

router.put('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { is_read: true, read_at: new Date() },
      { new: true }
    );
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/read-all', async (req, res) => {
  try {
    const { audience = 'admin' } = req.body;
    await Notification.updateMany({ audience, is_read: false }, { is_read: true, read_at: new Date() });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/', async (req, res) => {
  try {
    const { audience = 'admin', read_only = 'true' } = req.query;
    const query = { audience };
    if (read_only === 'true') query.is_read = true;
    await Notification.deleteMany(query);
    res.json({ success: true, message: 'Notifications cleared' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== DAILY "ON LEAVE TODAY" SCAN ====================
// Call this once a day (cron / scheduled task) to raise alerts for every
// approved leave that is active today. Safe to call multiple times a day —
// it will not duplicate an alert already created today for the same leave.

router.post('/scan-leaves-today', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const leavesToday = await LeaveRequest.find({
      status: 'approved',
      from_date: { $lte: tomorrow },
      to_date: { $gte: today },
    });

    let created = 0;

    for (const leave of leavesToday) {
      const alreadyNotified = await Notification.findOne({
        related_id: leave._id,
        related_type: 'LeaveRequest',
        type: 'leave',
        category: 'alert',
        created_at: { $gte: today, $lt: tomorrow },
      });
      if (alreadyNotified) continue;

      let userName = 'User';
      if (leave.user_type === 'faculty') {
        const Faculty = require('../models/Faculty');
        const f = await Faculty.findById(leave.user_id).select('faculty_name');
        userName = f?.faculty_name || 'Faculty';
      } else {
        const Student = require('../models/Student');
        const s = await Student.findById(leave.user_id).select('name');
        userName = s?.name || 'Student';
      }

      await notifyLeaveOnDay(leave, userName);
      created++;
    }

    res.json({
      success: true,
      message: `Scanned ${leavesToday.length} active leave(s), created ${created} new alert(s)`,
    });
  } catch (error) {
    console.error('Error scanning today leaves:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;