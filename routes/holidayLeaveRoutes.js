// routes/holidayLeaveRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Holiday = require('../models/Holiday');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveSettings = require('../models/LeaveSettings');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');

// ==================== HELPER FUNCTIONS ====================

// Get leave type label
const getLeaveTypeLabel = (type) => {
  const labels = {
    sick: 'Sick Leave',
    casual: 'Casual Leave',
    earned: 'Earned Leave',
    study: 'Study Leave',
    other: 'Other',
  };
  return labels[type] || type;
};

// Get holiday type color
const getHolidayTypeColor = (type) => {
  const colors = {
    public: 'bg-red-100 text-red-700',
    academic: 'bg-blue-100 text-blue-700',
    optional: 'bg-purple-100 text-purple-700',
    custom: 'bg-green-100 text-green-700',
  };
  return colors[type] || colors.custom;
};

// Get leave status color
const getLeaveStatusColor = (status) => {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };
  return colors[status] || colors.pending;
};

// Format holiday for frontend
const formatHolidayResponse = (holiday) => {
  const dateStr = holiday.date.toISOString().split('T')[0];
  return {
    [dateStr]: {
      name: holiday.name,
      type: holiday.type,
      description: holiday.description || '',
      color: holiday.color || '#FF6B6B',
      for_faculty: holiday.for_faculty !== undefined ? holiday.for_faculty : true,
      for_students: holiday.for_students !== undefined ? holiday.for_students : true,
      affected_classes: holiday.affected_classes || [],
      _id: holiday._id,
    },
  };
};

// Format leave request for frontend
const formatLeaveResponse = async (leave) => {
  let userDetails = null;
  
  if (leave.user_type === 'faculty') {
    userDetails = await Faculty.findById(leave.user_id).select('faculty_name department assigned_class assigned_section');
  } else if (leave.user_type === 'student') {
    userDetails = await Student.findById(leave.user_id).select('name class_id section');
  }
  
  let substituteTeacher = null;
  if (leave.substitute_teacher_id) {
    substituteTeacher = await Faculty.findById(leave.substitute_teacher_id).select('faculty_name');
  }
  
  let approver = null;
  if (leave.approved_by) {
    approver = await Faculty.findById(leave.approved_by).select('faculty_name');
  }
  
  return {
    id: leave._id,
    user_id: leave.user_id,
    user_name: userDetails ? 
      (userDetails.faculty_name || userDetails.name || 'Unknown') : 'Unknown',
    user_type: leave.user_type,
    department: userDetails && userDetails.department ? userDetails.department : undefined,
    class_name: userDetails && userDetails.class_id ? userDetails.class_id : leave.assigned_class,
    section: userDetails && userDetails.section ? userDetails.section : undefined,
    leave_type: leave.leave_type,
    leave_type_label: getLeaveTypeLabel(leave.leave_type),
    from_date: leave.from_date.toISOString().split('T')[0],
    to_date: leave.to_date.toISOString().split('T')[0],
    reason: leave.reason,
    status: leave.status,
    status_color: getLeaveStatusColor(leave.status),
    assigned_class: leave.assigned_class,
    assigned_section: leave.assigned_section,
    substitute_teacher: substituteTeacher ? substituteTeacher.faculty_name : (leave.substitute_teacher_name || null),
    substitute_teacher_id: leave.substitute_teacher_id,
    approved_by: approver ? approver.faculty_name : (leave.approved_by_name || null),
    approved_at: leave.approved_at,
    rejection_reason: leave.rejection_reason,
    substitute_notes: leave.substitute_notes || '',
    created_at: leave.created_at.toISOString().split('T')[0],
    updated_at: leave.updated_at.toISOString().split('T')[0],
    duration_days: leave.duration_days,
  };
};

// ==================== HOLIDAY ROUTES ====================

// GET all holidays
router.get('/holidays', async (req, res) => {
  try {
    const { year, month, from, to, type } = req.query;
    let query = {};
    
    if (year && month) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    if (from && to) {
      query.date = { $gte: new Date(from), $lte: new Date(to) };
    }
    
    if (type) {
      query.type = type;
    }
    
    const holidays = await Holiday.find(query).sort({ date: 1 });
    
    // Format response for frontend compatibility
    const formattedHolidays = {};
    holidays.forEach(holiday => {
      const dateStr = holiday.date.toISOString().split('T')[0];
      formattedHolidays[dateStr] = {
        name: holiday.name,
        type: holiday.type,
        description: holiday.description || '',
        color: holiday.color || '#FF6B6B',
        for_faculty: holiday.for_faculty !== undefined ? holiday.for_faculty : true,
        for_students: holiday.for_students !== undefined ? holiday.for_students : true,
        affected_classes: holiday.affected_classes || [],
        _id: holiday._id,
      };
    });
    
    res.status(200).json({
      success: true,
      data: formattedHolidays,
      count: holidays.length,
    });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching holidays',
      error: error.message,
    });
  }
});

// GET holiday by date
router.get('/holidays/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const holiday = await Holiday.findOne({ date: new Date(date) });
    
    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found for this date',
      });
    }
    
    res.status(200).json({
      success: true,
      data: formatHolidayResponse(holiday),
    });
  } catch (error) {
    console.error('Error fetching holiday:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching holiday',
      error: error.message,
    });
  }
});

// POST create holiday
router.post('/holidays', async (req, res) => {
  try {
    const { 
      date, name, type, description, color, 
      for_faculty, for_students, affected_classes 
    } = req.body;
    
    if (!date || !name) {
      return res.status(400).json({
        success: false,
        message: 'Date and name are required',
      });
    }
    
    // Check if holiday already exists
    const existingHoliday = await Holiday.findOne({ date: new Date(date) });
    if (existingHoliday) {
      return res.status(400).json({
        success: false,
        message: 'Holiday already exists for this date',
      });
    }
    
    const holiday = new Holiday({
      date: new Date(date),
      name,
      type: type || 'public',
      description: description || '',
      color: color || '#FF6B6B',
      for_faculty: for_faculty !== undefined ? for_faculty : true,
      for_students: for_students !== undefined ? for_students : true,
      affected_classes: affected_classes || [],
      created_by: req.user ? req.user.id : null,
    });
    
    await holiday.save();
    
    res.status(201).json({
      success: true,
      message: 'Holiday created successfully',
      data: formatHolidayResponse(holiday),
    });
  } catch (error) {
    console.error('Error creating holiday:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating holiday',
      error: error.message,
    });
  }
});

// PUT update holiday
router.put('/holidays/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { name, type, description, color, for_faculty, for_students, affected_classes } = req.body;
    
    const holiday = await Holiday.findOne({ date: new Date(date) });
    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found',
      });
    }
    
    if (name) holiday.name = name;
    if (type) holiday.type = type;
    if (description !== undefined) holiday.description = description;
    if (color) holiday.color = color;
    if (for_faculty !== undefined) holiday.for_faculty = for_faculty;
    if (for_students !== undefined) holiday.for_students = for_students;
    if (affected_classes) holiday.affected_classes = affected_classes;
    
    await holiday.save();
    
    res.status(200).json({
      success: true,
      message: 'Holiday updated successfully',
      data: formatHolidayResponse(holiday),
    });
  } catch (error) {
    console.error('Error updating holiday:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating holiday',
      error: error.message,
    });
  }
});

// DELETE holiday
router.delete('/holidays/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const holiday = await Holiday.findOneAndDelete({ date: new Date(date) });
    
    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found',
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Holiday deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting holiday',
      error: error.message,
    });
  }
});

// ==================== LEAVE REQUEST ROUTES ====================

// GET all leave requests
router.get('/leaves', async (req, res) => {
  try {
    const { 
      user_type, user_id, status, leave_type, 
      assigned_class, from_date, to_date,
      search, limit = 50, page = 1
    } = req.query;
    
    let query = {};
    
    if (user_type) query.user_type = user_type;
    if (user_id) query.user_id = user_id;
    if (status) query.status = status;
    if (leave_type) query.leave_type = leave_type;
    if (assigned_class) query.assigned_class = assigned_class;
    
    if (from_date) {
      query.from_date = { $gte: new Date(from_date) };
    }
    if (to_date) {
      query.to_date = { $lte: new Date(to_date) };
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let leaveRequests = await LeaveRequest.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      const filteredLeaves = [];
      
      for (const leave of leaveRequests) {
        let userDetails = null;
        if (leave.user_type === 'faculty') {
          userDetails = await Faculty.findById(leave.user_id).select('faculty_name department assigned_class');
        } else if (leave.user_type === 'student') {
          userDetails = await Student.findById(leave.user_id).select('name class_id section');
        }
        
        const userName = userDetails ? 
          (userDetails.faculty_name || userDetails.name || '').toLowerCase() : '';
        const reason = (leave.reason || '').toLowerCase();
        const className = leave.assigned_class ? leave.assigned_class.toLowerCase() : '';
        const department = userDetails && userDetails.department ? 
          userDetails.department.toLowerCase() : '';
        
        if (userName.includes(searchLower) || 
            reason.includes(searchLower) ||
            className.includes(searchLower) ||
            department.includes(searchLower)) {
          filteredLeaves.push(leave);
        }
      }
      leaveRequests = filteredLeaves;
    }
    
    const total = await LeaveRequest.countDocuments(query);
    
    // Format response
    const formattedLeaves = [];
    for (const leave of leaveRequests) {
      formattedLeaves.push(await formatLeaveResponse(leave));
    }
    
    res.status(200).json({
      success: true,
      data: formattedLeaves,
      pagination: {
        total: search ? formattedLeaves.length : total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil((search ? formattedLeaves.length : total) / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching leave requests',
      error: error.message,
    });
  }
});

// GET single leave request
router.get('/leaves/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leave = await LeaveRequest.findById(id);
    
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }
    
    const formattedLeave = await formatLeaveResponse(leave);
    
    res.status(200).json({
      success: true,
      data: formattedLeave,
    });
  } catch (error) {
    console.error('Error fetching leave request:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching leave request',
      error: error.message,
    });
  }
});

// POST create leave request
router.post('/leaves', async (req, res) => {
  try {
    const { 
      user_id, user_type, leave_type, from_date, to_date, 
      reason, assigned_class, assigned_section, 
      substitute_teacher_id, substitute_teacher_name,
      substitute_notes
    } = req.body;
    
    // Validate required fields
    if (!user_id || !user_type || !from_date || !to_date || !reason) {
      return res.status(400).json({
        success: false,
        message: 'User ID, user type, from date, to date, and reason are required',
      });
    }
    
    // Validate user exists
    let userModel;
    if (user_type === 'faculty') {
      userModel = Faculty;
    } else if (user_type === 'student') {
      userModel = Student;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type. Must be "faculty" or "student"',
      });
    }
    
    const user = await userModel.findById(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    // Validate dates
    const from = new Date(from_date);
    const to = new Date(to_date);
    if (to < from) {
      return res.status(400).json({
        success: false,
        message: 'To date must be after from date',
      });
    }
    
    // Check for overlapping approved leaves
    const overlappingLeave = await LeaveRequest.findOne({
      user_id,
      user_type,
      status: 'approved',
      $or: [
        { 
          from_date: { $lte: to }, 
          to_date: { $gte: from } 
        }
      ],
    });
    
    if (overlappingLeave) {
      return res.status(400).json({
        success: false,
        message: 'User already has an approved leave in this date range',
      });
    }
    
    // Validate substitute teacher if provided
    if (substitute_teacher_id) {
      const substitute = await Faculty.findById(substitute_teacher_id);
      if (!substitute) {
        return res.status(404).json({
          success: false,
          message: 'Substitute teacher not found',
        });
      }
    }
    
    const leave = new LeaveRequest({
      user_id,
      user_type,
      user_type_model: user_type === 'faculty' ? 'Faculty' : 'Student',
      leave_type: leave_type || 'casual',
      from_date: from,
      to_date: to,
      reason,
      assigned_class: assigned_class || null,
      assigned_section: assigned_section || null,
      substitute_teacher_id: substitute_teacher_id || null,
      substitute_teacher_name: substitute_teacher_name || null,
      substitute_notes: substitute_notes || '',
      status: 'pending',
    });
    
    await leave.save();
    
    const formattedLeave = await formatLeaveResponse(leave);
    
    res.status(201).json({
      success: true,
      message: 'Leave request created successfully',
      data: formattedLeave,
    });
  } catch (error) {
    console.error('Error creating leave request:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating leave request',
      error: error.message,
    });
  }
});

// PUT update leave request
router.put('/leaves/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      leave_type, from_date, to_date, reason, 
      assigned_class, assigned_section,
      substitute_teacher_id, substitute_teacher_name,
      substitute_notes
    } = req.body;
    
    const leave = await LeaveRequest.findById(id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }
    
    // Can't modify approved/rejected leaves
    if (leave.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot modify a leave request that is already ${leave.status}`,
      });
    }
    
    // Validate dates if both provided
    if (from_date && to_date) {
      const from = new Date(from_date);
      const to = new Date(to_date);
      if (to < from) {
        return res.status(400).json({
          success: false,
          message: 'To date must be after from date',
        });
      }
    }
    
    // Validate substitute teacher if provided
    if (substitute_teacher_id) {
      const substitute = await Faculty.findById(substitute_teacher_id);
      if (!substitute) {
        return res.status(404).json({
          success: false,
          message: 'Substitute teacher not found',
        });
      }
    }
    
    if (leave_type) leave.leave_type = leave_type;
    if (from_date) leave.from_date = new Date(from_date);
    if (to_date) leave.to_date = new Date(to_date);
    if (reason) leave.reason = reason;
    if (assigned_class !== undefined) leave.assigned_class = assigned_class;
    if (assigned_section !== undefined) leave.assigned_section = assigned_section;
    if (substitute_teacher_id !== undefined) leave.substitute_teacher_id = substitute_teacher_id;
    if (substitute_teacher_name !== undefined) leave.substitute_teacher_name = substitute_teacher_name;
    if (substitute_notes !== undefined) leave.substitute_notes = substitute_notes;
    
    await leave.save();
    
    const formattedLeave = await formatLeaveResponse(leave);
    
    res.status(200).json({
      success: true,
      message: 'Leave request updated successfully',
      data: formattedLeave,
    });
  } catch (error) {
    console.error('Error updating leave request:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating leave request',
      error: error.message,
    });
  }
});

// DELETE leave request
router.delete('/leaves/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leave = await LeaveRequest.findById(id);
    
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }
    
    // Can't delete approved/rejected leaves
    if (leave.status === 'approved' || leave.status === 'rejected') {
      return res.status(400).json({
        success: false,
        message: `Cannot delete a leave request that is already ${leave.status}`,
      });
    }
    
    await leave.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Leave request deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting leave request:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting leave request',
      error: error.message,
    });
  }
});

// PUT approve leave request
router.put('/leaves/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { substitute_teacher_id, substitute_teacher_name } = req.body;
    
    const leave = await LeaveRequest.findById(id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }
    
    if (leave.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Leave request is already ${leave.status}`,
      });
    }
    
    // Validate substitute teacher if provided
    if (substitute_teacher_id) {
      const substitute = await Faculty.findById(substitute_teacher_id);
      if (!substitute) {
        return res.status(404).json({
          success: false,
          message: 'Substitute teacher not found',
        });
      }
      leave.substitute_teacher_id = substitute_teacher_id;
      leave.substitute_teacher_name = substitute_teacher_name || substitute.faculty_name;
    } else if (substitute_teacher_name) {
      leave.substitute_teacher_name = substitute_teacher_name;
    }
    
    leave.status = 'approved';
    leave.approved_by = req.user ? req.user.id : null;
    leave.approved_by_name = req.user ? req.user.username : null;
    leave.approved_at = new Date();
    
    await leave.save();
    
    const formattedLeave = await formatLeaveResponse(leave);
    
    res.status(200).json({
      success: true,
      message: 'Leave request approved successfully',
      data: formattedLeave,
    });
  } catch (error) {
    console.error('Error approving leave:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving leave request',
      error: error.message,
    });
  }
});

// PUT reject leave request
router.put('/leaves/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    
    const leave = await LeaveRequest.findById(id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }
    
    if (leave.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Leave request is already ${leave.status}`,
      });
    }
    
    leave.status = 'rejected';
    leave.approved_by = req.user ? req.user.id : null;
    leave.approved_by_name = req.user ? req.user.username : null;
    leave.approved_at = new Date();
    leave.rejection_reason = rejection_reason || null;
    
    await leave.save();
    
    const formattedLeave = await formatLeaveResponse(leave);
    
    res.status(200).json({
      success: true,
      message: 'Leave request rejected successfully',
      data: formattedLeave,
    });
  } catch (error) {
    console.error('Error rejecting leave:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting leave request',
      error: error.message,
    });
  }
});

// PUT cancel leave request
router.put('/leaves/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    
    const leave = await LeaveRequest.findById(id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }
    
    if (leave.status === 'rejected' || leave.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a leave request that is already ${leave.status}`,
      });
    }
    
    leave.status = 'cancelled';
    await leave.save();
    
    const formattedLeave = await formatLeaveResponse(leave);
    
    res.status(200).json({
      success: true,
      message: 'Leave request cancelled successfully',
      data: formattedLeave,
    });
  } catch (error) {
    console.error('Error cancelling leave:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling leave request',
      error: error.message,
    });
  }
});

// ==================== STATISTICS ROUTES ====================

// GET leave statistics
router.get('/stats', async (req, res) => {
  try {
    const { user_type, user_id } = req.query;
    
    let filter = {};
    if (user_type) filter.user_type = user_type;
    if (user_id) filter.user_id = user_id;
    
    const total = await LeaveRequest.countDocuments(filter);
    const faculty = await LeaveRequest.countDocuments({ ...filter, user_type: 'faculty' });
    const student = await LeaveRequest.countDocuments({ ...filter, user_type: 'student' });
    const pending = await LeaveRequest.countDocuments({ ...filter, status: 'pending' });
    const approved = await LeaveRequest.countDocuments({ ...filter, status: 'approved' });
    const rejected = await LeaveRequest.countDocuments({ ...filter, status: 'rejected' });
    const cancelled = await LeaveRequest.countDocuments({ ...filter, status: 'cancelled' });
    
    // Today's leaves
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayLeaves = await LeaveRequest.countDocuments({
      ...filter,
      from_date: { $lte: tomorrow },
      to_date: { $gte: today },
      status: 'approved',
    });
    
    // Holiday count
    const holidayCount = await Holiday.countDocuments();
    
    // Leave type breakdown
    const leaveTypeBreakdown = await LeaveRequest.aggregate([
      { $match: filter },
      { $group: { _id: '$leave_type', count: { $sum: 1 } } },
    ]);
    
    // Status breakdown
    const statusBreakdown = await LeaveRequest.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    
    // Monthly trends - last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyTrends = await LeaveRequest.aggregate([
      { 
        $match: { 
          ...filter,
          created_at: { $gte: sixMonthsAgo } 
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$created_at' },
            month: { $month: '$created_at' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
    
    const stats = {
      total,
      faculty,
      student,
      pending,
      approved,
      rejected,
      cancelled,
      today: todayLeaves,
      holidays: holidayCount,
      breakdown: {
        by_type: leaveTypeBreakdown,
        by_status: statusBreakdown,
      },
      trends: monthlyTrends,
    };
    
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message,
    });
  }
});

// GET user leave summary
router.get('/users/:user_type/:user_id/summary', async (req, res) => {
  try {
    const { user_type, user_id } = req.params;
    
    if (!user_id || !user_type) {
      return res.status(400).json({
        success: false,
        message: 'User ID and type are required',
      });
    }
    
    const leaves = await LeaveRequest.find({
      user_id,
      user_type,
    });
    
    const summary = {
      total: leaves.length,
      pending: leaves.filter(l => l.status === 'pending').length,
      approved: leaves.filter(l => l.status === 'approved').length,
      rejected: leaves.filter(l => l.status === 'rejected').length,
      cancelled: leaves.filter(l => l.status === 'cancelled').length,
      by_type: {},
    };
    
    // Group by leave type
    leaves.forEach(leave => {
      if (!summary.by_type[leave.leave_type]) {
        summary.by_type[leave.leave_type] = {
          total: 0,
          approved: 0,
          pending: 0,
          label: getLeaveTypeLabel(leave.leave_type),
        };
      }
      summary.by_type[leave.leave_type].total++;
      if (leave.status === 'approved') {
        summary.by_type[leave.leave_type].approved++;
      }
      if (leave.status === 'pending') {
        summary.by_type[leave.leave_type].pending++;
      }
    });
    
    // Calculate total days used (approved leaves only)
    let totalDaysUsed = 0;
    leaves.filter(l => l.status === 'approved').forEach(leave => {
      const from = new Date(leave.from_date);
      const to = new Date(leave.to_date);
      const diffTime = Math.abs(to - from);
      totalDaysUsed += Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    });
    summary.total_days_used = totalDaysUsed;
    
    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error fetching user leave summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user leave summary',
      error: error.message,
    });
  }
});

// ==================== SETTINGS ROUTES ====================

// GET leave settings
router.get('/settings', async (req, res) => {
  try {
    let settings = await LeaveSettings.findOne();
    
    // Create default settings if none exist
    if (!settings) {
      settings = new LeaveSettings();
      await settings.save();
    }
    
    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching settings',
      error: error.message,
    });
  }
});

// PUT update leave settings
router.put('/settings', async (req, res) => {
  try {
    const updates = req.body;
    
    let settings = await LeaveSettings.findOne();
    if (!settings) {
      settings = new LeaveSettings();
    }
    
    // Update fields
    Object.keys(updates).forEach(key => {
      if (key === 'leave_limits') {
        // Merge nested leave limits
        Object.keys(updates.leave_limits).forEach(leaveType => {
          if (settings.leave_limits[leaveType]) {
            Object.keys(updates.leave_limits[leaveType]).forEach(field => {
              settings.leave_limits[leaveType][field] = updates.leave_limits[leaveType][field];
            });
          }
        });
      } else if (key === 'holiday_settings') {
        Object.keys(updates.holiday_settings).forEach(field => {
          settings.holiday_settings[field] = updates.holiday_settings[field];
        });
      } else if (key === 'notifications') {
        Object.keys(updates.notifications).forEach(field => {
          settings.notifications[field] = updates.notifications[field];
        });
      } else {
        settings[key] = updates[key];
      }
    });
    
    settings.updated_by = req.user ? req.user.id : null;
    await settings.save();
    
    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating settings',
      error: error.message,
    });
  }
});

// ==================== HELPER ROUTES ====================

// GET substitute teachers
router.get('/substitute-teachers', async (req, res) => {
  try {
    const { date, class_name } = req.query;
    
    // Find all active faculty
    let query = { status: 'Active' };
    
    // If date provided, exclude faculty on leave
    if (date) {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      
      const facultyOnLeave = await LeaveRequest.find({
        user_type: 'faculty',
        status: 'approved',
        from_date: { $lte: targetDate },
        to_date: { $gte: targetDate },
      }).distinct('user_id');
      
      if (facultyOnLeave.length > 0) {
        query._id = { $nin: facultyOnLeave };
      }
    }
    
    const substitutes = await Faculty.find(query).select('faculty_name assigned_class subject mobile_number email');
    
    res.status(200).json({
      success: true,
      data: substitutes,
    });
  } catch (error) {
    console.error('Error fetching substitute teachers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching substitute teachers',
      error: error.message,
    });
  }
});

// GET available faculty (for leave form)
router.get('/faculty-options', async (req, res) => {
  try {
    const faculty = await Faculty.find({ status: 'Active' })
      .select('faculty_name assigned_class subject mobile_number email')
      .sort({ faculty_name: 1 });
    
    res.status(200).json({
      success: true,
      data: faculty,
    });
  } catch (error) {
    console.error('Error fetching faculty options:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching faculty options',
      error: error.message,
    });
  }
});

// GET available students (for leave form)
router.get('/student-options', async (req, res) => {
  try {
    const { class_id, section } = req.query;
    let query = { status: 'Active' };
    
    if (class_id) query.class_id = class_id;
    if (section) query.section = section;
    
    const students = await Student.find(query)
      .select('name class_id section parent_name parent_phone')
      .sort({ name: 1 });
    
    res.status(200).json({
      success: true,
      data: students,
    });
  } catch (error) {
    console.error('Error fetching student options:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching student options',
      error: error.message,
    });
  }
});

// GET class-wise holiday summary
router.get('/class-holiday-summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    let query = {};
    
    if (from && to) {
      query.date = { $gte: new Date(from), $lte: new Date(to) };
    }
    
    const holidays = await Holiday.find(query);
    
    // Group holidays by class
    const classHolidays = {
      Toddler: { count: 0, holidays: [] },
      'Pre-Nursery': { count: 0, holidays: [] },
      Nursery: { count: 0, holidays: [] },
      'KG-1': { count: 0, holidays: [] },
    };
    
    holidays.forEach(holiday => {
      if (holiday.affected_classes && holiday.affected_classes.length > 0) {
        holiday.affected_classes.forEach(cls => {
          if (classHolidays[cls]) {
            classHolidays[cls].count++;
            classHolidays[cls].holidays.push(holiday.name);
          }
        });
      }
    });
    
    res.status(200).json({
      success: true,
      data: classHolidays,
    });
  } catch (error) {
    console.error('Error fetching class holiday summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching class holiday summary',
      error: error.message,
    });
  }
});

// ==================== BULK OPERATIONS ====================

// POST bulk create holidays
router.post('/holidays/bulk', async (req, res) => {
  try {
    const { holidays } = req.body;
    
    if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Holidays array is required',
      });
    }
    
    const results = {
      created: 0,
      skipped: 0,
      errors: [],
    };
    
    for (const holidayData of holidays) {
      try {
        const { date, name, type, description, color, for_faculty, for_students, affected_classes } = holidayData;
        
        if (!date || !name) {
          results.skipped++;
          results.errors.push({ date, error: 'Date and name are required' });
          continue;
        }
        
        // Check if holiday already exists
        const existing = await Holiday.findOne({ date: new Date(date) });
        if (existing) {
          results.skipped++;
          results.errors.push({ date, error: 'Holiday already exists for this date' });
          continue;
        }
        
        const holiday = new Holiday({
          date: new Date(date),
          name,
          type: type || 'public',
          description: description || '',
          color: color || '#FF6B6B',
          for_faculty: for_faculty !== undefined ? for_faculty : true,
          for_students: for_students !== undefined ? for_students : true,
          affected_classes: affected_classes || [],
          created_by: req.user ? req.user.id : null,
        });
        
        await holiday.save();
        results.created++;
      } catch (error) {
        results.errors.push({ error: error.message });
        results.skipped++;
      }
    }
    
    res.status(201).json({
      success: true,
      message: `Bulk holiday creation completed: ${results.created} created, ${results.skipped} skipped`,
      data: results,
    });
  } catch (error) {
    console.error('Error bulk creating holidays:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk creating holidays',
      error: error.message,
    });
  }
});

// POST bulk approve leaves
router.post('/leaves/bulk/approve', async (req, res) => {
  try {
    const { leave_ids, substitute_teacher_id } = req.body;
    
    if (!leave_ids || !Array.isArray(leave_ids) || leave_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Leave IDs array is required',
      });
    }
    
    const results = {
      approved: 0,
      skipped: 0,
      errors: [],
    };
    
    for (const leaveId of leave_ids) {
      try {
        const leave = await LeaveRequest.findById(leaveId);
        if (!leave) {
          results.skipped++;
          results.errors.push({ id: leaveId, error: 'Leave not found' });
          continue;
        }
        
        if (leave.status !== 'pending') {
          results.skipped++;
          results.errors.push({ id: leaveId, error: `Already ${leave.status}` });
          continue;
        }
        
        if (substitute_teacher_id) {
          const substitute = await Faculty.findById(substitute_teacher_id);
          if (substitute) {
            leave.substitute_teacher_id = substitute_teacher_id;
            leave.substitute_teacher_name = substitute.faculty_name;
          }
        }
        
        leave.status = 'approved';
        leave.approved_by = req.user ? req.user.id : null;
        leave.approved_by_name = req.user ? req.user.username : null;
        leave.approved_at = new Date();
        
        await leave.save();
        results.approved++;
      } catch (error) {
        results.errors.push({ id: leaveId, error: error.message });
        results.skipped++;
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Bulk approval completed: ${results.approved} approved, ${results.skipped} skipped`,
      data: results,
    });
  } catch (error) {
    console.error('Error bulk approving leaves:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk approving leaves',
      error: error.message,
    });
  }
});

// ==================== HEALTH CHECK ====================

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Holiday & Leave Management API is running',
    version: '1.0.0',
    endpoints: {
      holidays: '/holidays',
      leaves: '/leaves',
      stats: '/stats',
      settings: '/settings',
      substitute_teachers: '/substitute-teachers',
      faculty_options: '/faculty-options',
      student_options: '/student-options',
    },
  });
});

module.exports = router;