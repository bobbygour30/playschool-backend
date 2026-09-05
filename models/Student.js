// models/Student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
  },
  date_of_birth: {
    type: Date,
    required: true,
  },
  gender: {
    type: String,
    required: true,
    enum: ['Male', 'Female'],
  },
  blood_group: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    default: '',
  },
  class_id: {
    type: String,
    default: null,
  },
  section: {
    type: String,
    default: 'A',
    uppercase: true,
    enum: ['A', 'B', 'C', 'D'],
  },
  class_type: {
    type: String,
    enum: ['standard', 'custom'],
    default: 'standard',
  },
  
  // Staff Assignment
  assigned_teacher_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    default: null,
  },
  
  // Parent Information
  parent_name: {
    type: String,
    required: true,
  },
  parent_relationship: {
    type: String,
    enum: ['Mother', 'Father', 'Guardian'],
    default: 'Mother',
  },
  parent_email: {
    type: String,
    required: true,
  },
  parent_phone: {
    type: String,
    required: true,
  },
  parent_aadhar: {
    type: String,
    default: '',
  },
  
  // Contact Information
  address: {
    type: String,
    required: true,
  },
  emergency_contact: {
    type: String,
    required: true,
  },
  medical_info: {
    type: String,
    default: '',
  },
  
  // Academic Information
  enrollment_date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Graduated'],
    default: 'Active',
  },
  
  // Fee and Charges Information - Updated with all fee types
  registration_fee: {
    type: Number,
    default: 0,
  },
  admission_fee: {
    type: Number,
    default: 0,
  },
  tuition_fee: {
    type: Number,
    default: 0,
  },
  activity_fee: {
    type: Number,
    default: 0,
  },
  kit_fee: {
    type: Number,
    default: 0,
  },
  cab_fee: {
    type: Number,
    default: 0,
  },
  camera_fee: {
    type: Number,
    default: 0,
  },
  total_amount: {
    type: Number,
    default: 0,
  },
  fee_paid: {
    type: Boolean,
    default: false,
  },
  payment_date: {
    type: Date,
    default: null,
  },
  payment_mode: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'],
    default: 'Cash',
  },
  
  // Transport Information
  transport_type: {
    type: String,
    enum: ['Cab', 'Walker', 'Bus'],
    default: 'Walker',
  },
  vehicle_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null,
  },
  vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null,
  },
  
  // Documents Storage - Birth Certificate and Parent Aadhar are mandatory
  documents: {
    birth_certificate: { 
      type: String, 
      required: true,
      default: null 
    },
    aadhar_card: { 
      type: String, 
      default: null 
    },
    parent_aadhar_front: { 
      type: String, 
      required: true,
      default: null 
    },
    parent_aadhar_back: { 
      type: String, 
      required: true,
      default: null 
    },
  },
  
  // Promotion audit trail — records every class change made by the
  // "Promote Students" bulk action, for history/reporting purposes.
  promotion_history: [{
    from_class: { type: String, default: '' },
    to_class: { type: String, default: '' }, // 'Graduated' when the student completes KG-1
    academic_year: { type: String, default: '' },
    promoted_at: { type: Date, default: Date.now },
  }],
  
  // ==================== NEW FIELDS FOR HOLIDAY & LEAVE MANAGEMENT ====================
  
  // Leave balance tracking for students
  leave_balances: {
    sick: {
      total: { type: Number, default: 10 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 10 },
    },
    casual: {
      total: { type: Number, default: 5 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 5 },
    },
    study: {
      total: { type: Number, default: 3 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 3 },
    },
    other: {
      total: { type: Number, default: 2 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 2 },
    },
  },
  
  // Parent/Guardian preferences for leave notifications
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: false },
    },
    leave_approval_required: {
      type: Boolean,
      default: true,
    },
  },
  
  // Attendance tracking
  attendance: {
    present_days: { type: Number, default: 0 },
    absent_days: { type: Number, default: 0 },
    total_days: { type: Number, default: 0 },
    attendance_percentage: { type: Number, default: 0 },
  },
  
  // Leave history summary (cached for quick access)
  leave_summary: {
    total_leaves: { type: Number, default: 0 },
    pending_leaves: { type: Number, default: 0 },
    approved_leaves: { type: Number, default: 0 },
    rejected_leaves: { type: Number, default: 0 },
    total_days_used: { type: Number, default: 0 },
  },
  
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// ==================== PRE-SAVE MIDDLEWARE ====================

// Update timestamp on save
studentSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  
  // Auto-calculate total amount from all fee components
  this.total_amount = 
    (this.registration_fee || 0) + 
    (this.admission_fee || 0) + 
    (this.tuition_fee || 0) + 
    (this.activity_fee || 0) + 
    (this.kit_fee || 0) + 
    (this.cab_fee || 0) + 
    (this.camera_fee || 0);
  
  // Update attendance percentage
  if (this.attendance.total_days > 0) {
    this.attendance.attendance_percentage = 
      (this.attendance.present_days / this.attendance.total_days) * 100;
  }
  
  next();
});

// Pre-update middleware to calculate total
studentSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.registration_fee !== undefined || 
      update.admission_fee !== undefined || 
      update.tuition_fee !== undefined || 
      update.activity_fee !== undefined || 
      update.kit_fee !== undefined || 
      update.cab_fee !== undefined || 
      update.camera_fee !== undefined) {
    const reg = update.registration_fee || 0;
    const adm = update.admission_fee || 0;
    const tui = update.tuition_fee || 0;
    const act = update.activity_fee || 0;
    const kit = update.kit_fee || 0;
    const cab = update.cab_fee || 0;
    const cam = update.camera_fee || 0;
    update.total_amount = reg + adm + tui + act + kit + cab + cam;
  }
  next();
});

// ==================== INSTANCE METHODS ====================

// Calculate leave balance for a specific type
studentSchema.methods.calculateLeaveBalance = function(leaveType) {
  const balance = this.leave_balances[leaveType];
  if (!balance) return { total: 0, used: 0, remaining: 0 };
  
  const used = balance.used || 0;
  const total = balance.total || 0;
  return {
    total,
    used,
    remaining: total - used,
  };
};

// Get all leave balances
studentSchema.methods.getAllLeaveBalances = function() {
  const balances = {};
  const leaveTypes = ['sick', 'casual', 'study', 'other'];
  
  leaveTypes.forEach(type => {
    balances[type] = this.calculateLeaveBalance(type);
  });
  
  return balances;
};

// Deduct leave days from student's balance
studentSchema.methods.deductLeave = async function(leaveType, days) {
  const balance = this.leave_balances[leaveType];
  if (!balance) return { success: false, message: 'Invalid leave type' };
  
  const available = balance.total - balance.used;
  if (available < days) {
    return { 
      success: false, 
      message: `Insufficient leave balance. Available: ${available}, Requested: ${days}` 
    };
  }
  
  balance.used += days;
  balance.remaining = balance.total - balance.used;
  await this.save();
  return { success: true, remaining: balance.remaining };
};

// Add leave days (for carryover or adjustments)
studentSchema.methods.addLeave = async function(leaveType, days, isCarryover = false) {
  const balance = this.leave_balances[leaveType];
  if (!balance) return { success: false, message: 'Invalid leave type' };
  
  balance.total += days;
  balance.remaining = balance.total - balance.used;
  
  if (isCarryover) {
    balance.carryover = (balance.carryover || 0) + days;
  }
  
  await this.save();
  return { success: true, remaining: balance.remaining };
};

// Check if student has pending leave request
studentSchema.methods.hasPendingLeave = async function() {
  const LeaveRequest = mongoose.model('LeaveRequest');
  const count = await LeaveRequest.countDocuments({
    user_id: this._id,
    user_type: 'student',
    status: 'pending',
  });
  return count > 0;
};

// Get student's leave history
studentSchema.methods.getLeaveHistory = async function(limit = 10) {
  const LeaveRequest = mongoose.model('LeaveRequest');
  return await LeaveRequest.find({
    user_id: this._id,
    user_type: 'student',
  })
  .sort({ created_at: -1 })
  .limit(limit);
};

// Get student's active leaves (currently on leave)
studentSchema.methods.getActiveLeaves = async function() {
  const LeaveRequest = mongoose.model('LeaveRequest');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return await LeaveRequest.find({
    user_id: this._id,
    user_type: 'student',
    status: 'approved',
    from_date: { $lte: today },
    to_date: { $gte: today },
  });
};

// Check if student is on leave on a specific date
studentSchema.methods.isOnLeaveOnDate = async function(date) {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  
  const LeaveRequest = mongoose.model('LeaveRequest');
  const leave = await LeaveRequest.findOne({
    user_id: this._id,
    user_type: 'student',
    status: 'approved',
    from_date: { $lte: targetDate },
    to_date: { $gte: targetDate },
  });
  
  return !!leave;
};

// Update student's leave summary
studentSchema.methods.updateLeaveSummary = async function() {
  const LeaveRequest = mongoose.model('LeaveRequest');
  
  const summary = await LeaveRequest.aggregate([
    {
      $match: {
        user_id: this._id,
        user_type: 'student',
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalDays: {
          $sum: {
            $add: [
              { $subtract: ['$to_date', '$from_date'] },
              86400000 // Add 1 day in milliseconds
            ]
          }
        }
      }
    }
  ]);
  
  // Initialize summary
  this.leave_summary = {
    total_leaves: 0,
    pending_leaves: 0,
    approved_leaves: 0,
    rejected_leaves: 0,
    total_days_used: 0,
  };
  
  // Process summary results
  summary.forEach(item => {
    const days = Math.ceil(item.totalDays / (1000 * 60 * 60 * 24));
    this.leave_summary.total_leaves += item.count;
    
    if (item._id === 'pending') this.leave_summary.pending_leaves = item.count;
    if (item._id === 'approved') {
      this.leave_summary.approved_leaves = item.count;
      this.leave_summary.total_days_used += days;
    }
    if (item._id === 'rejected') this.leave_summary.rejected_leaves = item.count;
  });
  
  await this.save();
  return this.leave_summary;
};

// Record attendance
studentSchema.methods.recordAttendance = async function(status, date = new Date()) {
  const today = new Date(date);
  today.setHours(0, 0, 0, 0);
  
  // Check if already recorded for this date (implement your own logic)
  // This is a simplified version
  
  if (status === 'present') {
    this.attendance.present_days += 1;
  } else if (status === 'absent') {
    this.attendance.absent_days += 1;
  }
  
  this.attendance.total_days += 1;
  this.attendance.attendance_percentage = 
    (this.attendance.present_days / this.attendance.total_days) * 100;
  
  await this.save();
  return this.attendance;
};

// Get attendance report
studentSchema.methods.getAttendanceReport = function() {
  return {
    present_days: this.attendance.present_days,
    absent_days: this.attendance.absent_days,
    total_days: this.attendance.total_days,
    attendance_percentage: parseFloat(this.attendance.attendance_percentage.toFixed(2)),
    status: this.attendance.attendance_percentage >= 75 ? 'Good' : 'Needs Improvement',
  };
};

// ==================== STATIC METHODS ====================

// Get students by class with leave balances
studentSchema.statics.getStudentsByClassWithLeaveBalances = async function(classId) {
  return await this.find({ 
    class_id: classId,
    status: 'Active',
  }).select('name leave_balances attendance');
};

// Get students with pending leaves
studentSchema.statics.getStudentsWithPendingLeaves = async function() {
  const LeaveRequest = mongoose.model('LeaveRequest');
  const pendingLeaves = await LeaveRequest.find({
    user_type: 'student',
    status: 'pending',
  }).distinct('user_id');
  
  return await this.find({
    _id: { $in: pendingLeaves },
    status: 'Active',
  }).select('name class_id section parent_name parent_phone parent_email');
};

// Get students on leave today
studentSchema.statics.getStudentsOnLeaveToday = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const LeaveRequest = mongoose.model('LeaveRequest');
  const onLeave = await LeaveRequest.find({
    user_type: 'student',
    status: 'approved',
    from_date: { $lte: tomorrow },
    to_date: { $gte: today },
  }).distinct('user_id');
  
  return await this.find({
    _id: { $in: onLeave },
    status: 'Active',
  }).select('name class_id section parent_name parent_phone');
};

// Get student leave statistics by class
studentSchema.statics.getLeaveStatisticsByClass = async function() {
  const LeaveRequest = mongoose.model('LeaveRequest');
  
  const classes = ['Toddler', 'Pre-Nursery', 'Nursery', 'KG-1'];
  const stats = {};
  
  for (const className of classes) {
    const students = await this.find({ 
      class_id: className,
      status: 'Active',
    }).select('_id');
    
    const studentIds = students.map(s => s._id);
    
    const leaves = await LeaveRequest.aggregate([
      {
        $match: {
          user_id: { $in: studentIds },
          user_type: 'student',
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);
    
    const classStats = {
      total_students: studentIds.length,
      leaves: {
        pending: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0,
        total: 0,
      },
    };
    
    leaves.forEach(item => {
      classStats.leaves[item._id] = item.count;
      classStats.leaves.total += item.count;
    });
    
    stats[className] = classStats;
  }
  
  return stats;
};

// Reset leave balances for new academic year
studentSchema.statics.resetLeaveBalances = async function(academicYear) {
  const result = await this.updateMany(
    { status: 'Active' },
    {
      $set: {
        'leave_balances.sick.used': 0,
        'leave_balances.sick.remaining': 10,
        'leave_balances.casual.used': 0,
        'leave_balances.casual.remaining': 5,
        'leave_balances.study.used': 0,
        'leave_balances.study.remaining': 3,
        'leave_balances.other.used': 0,
        'leave_balances.other.remaining': 2,
        'leave_summary.total_leaves': 0,
        'leave_summary.pending_leaves': 0,
        'leave_summary.approved_leaves': 0,
        'leave_summary.rejected_leaves': 0,
        'leave_summary.total_days_used': 0,
      }
    }
  );
  
  return {
    success: true,
    modified: result.modifiedCount,
    message: `Leave balances reset for ${result.modifiedCount} students`,
  };
};

// ==================== VIRTUAL PROPERTIES ====================

// Virtual for full name with class
studentSchema.virtual('fullNameWithClass').get(function() {
  return `${this.name} (${this.class_id || 'No Class'} - Section ${this.section || 'A'})`;
});

// Virtual for leave status
studentSchema.virtual('leaveStatus').get(function() {
  const totalLeaves = this.leave_summary.total_leaves || 0;
  const pendingLeaves = this.leave_summary.pending_leaves || 0;
  
  if (pendingLeaves > 0) return 'Has Pending Leaves';
  if (totalLeaves === 0) return 'No Leave History';
  return 'Has Leave History';
});

// Virtual for attendance status
studentSchema.virtual('attendanceStatus').get(function() {
  const percentage = this.attendance.attendance_percentage || 0;
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 75) return 'Good';
  if (percentage >= 60) return 'Average';
  if (percentage >= 40) return 'Below Average';
  return 'Needs Improvement';
});

// Ensure virtuals are included in JSON output
studentSchema.set('toJSON', { virtuals: true });
studentSchema.set('toObject', { virtuals: true });

// ==================== INDEXES ====================

// Create indexes for better performance
studentSchema.index({ class_id: 1, status: 1 });
studentSchema.index({ 'leave_balances.sick.remaining': 1 });
studentSchema.index({ 'attendance.attendance_percentage': -1 });
studentSchema.index({ status: 1, created_at: -1 });
studentSchema.index({ parent_phone: 1 });
studentSchema.index({ parent_email: 1 });

module.exports = mongoose.model('Student', studentSchema);