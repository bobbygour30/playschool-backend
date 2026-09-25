// utils/notificationHelper.js
const Notification = require('../models/Notification');

const createNotification = async ({
  title,
  message,
  type = 'general',
  category = 'info',
  audience = 'admin',
  recipient_id = null,
  recipient_model = null,
  related_id = null,
  related_type = null,
  action_url = '',
  priority = 'normal',
}) => {
  try {
    const notification = new Notification({
      title,
      message,
      type,
      category,
      audience,
      recipient_id,
      recipient_model,
      related_id,
      related_type,
      action_url,
      priority,
    });
    await notification.save();
    return notification;
  } catch (error) {
    // Notifications are best-effort — never let a failure here break the calling route.
    console.error('Error creating notification:', error.message);
    return null;
  }
};

// ==================== LEAVE ====================

const notifyLeaveRequested = (leave, userName) =>
  createNotification({
    title: `New Leave Request — ${userName}`,
    message: `${userName} (${leave.user_type}) requested ${leave.leave_type} leave from ${new Date(leave.from_date).toDateString()} to ${new Date(leave.to_date).toDateString()}.`,
    type: 'leave',
    category: 'info',
    audience: 'admin',
    related_id: leave._id,
    related_type: 'LeaveRequest',
    action_url: '/holiday-leave?tab=leaves',
    priority: 'normal',
  });

const notifyLeaveStatusChanged = (leave, userName) =>
  createNotification({
    title: `Leave ${leave.status.charAt(0).toUpperCase() + leave.status.slice(1)} — ${userName}`,
    message: `${userName}'s ${leave.leave_type} leave (${new Date(leave.from_date).toDateString()} - ${new Date(leave.to_date).toDateString()}) was ${leave.status}.`,
    type: 'leave',
    category: leave.status === 'approved' ? 'success' : leave.status === 'rejected' ? 'warning' : 'info',
    audience: 'admin',
    related_id: leave._id,
    related_type: 'LeaveRequest',
    action_url: '/holiday-leave?tab=leaves',
    priority: 'normal',
  });

// Fired for approved leaves that are active "today" — used by the daily scan endpoint.
const notifyLeaveOnDay = (leave, userName) =>
  createNotification({
    title: `${userName} is on leave today`,
    message: `${userName} (${leave.user_type}) is on approved ${leave.leave_type} leave today${
      leave.substitute_teacher_name ? `. Substitute: ${leave.substitute_teacher_name}` : '.'
    }`,
    type: 'leave',
    category: 'alert',
    audience: 'admin',
    related_id: leave._id,
    related_type: 'LeaveRequest',
    action_url: '/holiday-leave?tab=calendar',
    priority: 'high',
  });

// ==================== ACHIEVEMENTS ====================

const notifyAchievementAdded = (achievement, studentName) =>
  createNotification({
    title: `New Achievement — ${studentName}`,
    message: `${studentName} earned "${achievement.title}" (${achievement.category}).`,
    type: 'achievement',
    category: 'success',
    audience: 'admin',
    related_id: achievement._id,
    related_type: 'Achievement',
    action_url: `/achievements?student=${achievement.student_id}`,
    priority: 'low',
  });

// ==================== FEES (optional — wire into finance.js if useful) ====================

const notifyFeeOverdue = (fee, studentName) =>
  createNotification({
    title: `Fee Overdue — ${studentName}`,
    message: `${studentName}'s invoice ${fee.invoice_number || ''} of ₹${(fee.total_amount || 0).toLocaleString()} is overdue.`,
    type: 'fee',
    category: 'alert',
    audience: 'admin',
    related_id: fee._id,
    related_type: 'Fee',
    action_url: '/finance?tab=fees',
    priority: 'high',
  });

module.exports = {
  createNotification,
  notifyLeaveRequested,
  notifyLeaveStatusChanged,
  notifyLeaveOnDay,
  notifyAchievementAdded,
  notifyFeeOverdue,
};