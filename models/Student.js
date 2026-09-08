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
    enum: ['Mother', 'Father', 'Guardian', 'Grandparent', 'Aunt', 'Uncle', 'Sibling', 'Other'],
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
  
  // ==================== EMERGENCY CONTACT ====================
  emergency_contact: {
    name: {
      type: String,
      required: true,
    },
    relationship: {
      type: String,
      enum: ['Mother', 'Father', 'Guardian', 'Grandparent', 'Aunt', 'Uncle', 'Sibling', 'Other'],
      required: true,
    },
    phone: {
      type: String,
      required: true,
      match: /^\d{10}$/,
    },
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
  
  // ==================== ENROLLMENT INFORMATION ====================
  admission_date: {
    type: Date,
    required: true,
  },
  academic_year: {
    type: String,
    required: true,
  },
  enrollment_type: {
    type: String,
    enum: ['New Admission', 'Transfer', 'Returning'],
    required: true,
    default: 'New Admission',
  },
  previous_class: {
    type: String,
    default: '',
  },
  
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Graduated'],
    default: 'Active',
  },
  
  // ==================== RECURRING FEES ====================
  recurring_fees: {
    tuition_fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    activity_fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    transport_fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    total_monthly: {
      type: Number,
      default: 0,
    },
    start_month: {
      type: String, // Format: YYYY-MM
      default: null,
    },
    end_month: {
      type: String, // Format: YYYY-MM
      default: null,
    },
    fee_plan: {
      type: String,
      enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'],
      default: 'Monthly',
    },
    last_generated_month: {
      type: String, // Format: YYYY-MM
      default: null,
    },
    auto_generate: {
      type: Boolean,
      default: true,
    },
    // Initial payment tracking
    initial_payment: {
      amount: {
        type: Number,
        default: 0,
      },
      paid: {
        type: Boolean,
        default: false,
      },
      payment_date: {
        type: Date,
        default: null,
      },
      payment_method: {
        type: String,
        enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'],
        default: 'Cash',
      },
      invoice_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Fee',
        default: null,
      },
      transaction_id: {
        type: String,
        default: '',
      },
    },
  },
  
  // ==================== FEE AND CHARGES ====================
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
  fee_frequency: {
    type: String,
    enum: ['Monthly', 'Quarterly', 'Annual'],
    default: 'Monthly',
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
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
  
  // ==================== FEE PAYMENT HISTORY ====================
  fee_payment_history: [{
    amount: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    method: {
      type: String,
      enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'],
      required: true,
    },
    invoice_number: {
      type: String,
      default: '',
    },
    invoice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Fee',
      default: null,
    },
    payment_type: {
      type: String,
      enum: ['full', 'partial', 'advance', 'initial'],
      default: 'full',
    },
    notes: {
      type: String,
      default: '',
    },
    recorded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  }],
  
  // ==================== TRANSPORT INFORMATION ====================
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
  
  // ==================== AUTHORIZED PICKUP (Only for Walker) ====================
  authorized_pickup: {
    name: {
      type: String,
      default: null,
    },
    relationship: {
      type: String,
      enum: ['Mother', 'Father', 'Guardian', 'Grandparent', 'Aunt', 'Uncle', 'Sibling', 'Other', ''],
      default: null,
    },
    phone: {
      type: String,
      default: null,
      match: /^\d{10}$/,
    },
  },
  
  // ==================== DOCUMENTS ====================
  documents: {
    student_photo: {
      type: String,
      required: true,
      default: null,
    },
    birth_certificate: {
      type: String,
      required: true,
      default: null,
    },
    aadhar_card: {
      type: String,
      default: null,
    },
    parent_aadhar_front: {
      type: String,
      required: true,
      default: null,
    },
    parent_aadhar_back: {
      type: String,
      required: true,
      default: null,
    },
  },
  
  // Promotion audit trail
  promotion_history: [{
    from_class: { type: String, default: '' },
    to_class: { type: String, default: '' },
    academic_year: { type: String, default: '' },
    promoted_at: { type: Date, default: Date.now },
  }],
  
  // ==================== LEAVE & HOLIDAY MANAGEMENT ====================
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
  
  attendance: {
    present_days: { type: Number, default: 0 },
    absent_days: { type: Number, default: 0 },
    total_days: { type: Number, default: 0 },
    attendance_percentage: { type: Number, default: 0 },
  },
  
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

studentSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  
  // Auto-calculate total amount from all fee components
  const subtotal = 
    (this.registration_fee || 0) + 
    (this.admission_fee || 0) + 
    (this.tuition_fee || 0) + 
    (this.activity_fee || 0) + 
    (this.kit_fee || 0) + 
    (this.cab_fee || 0) + 
    (this.camera_fee || 0);
  
  this.total_amount = Math.max(0, subtotal - (this.discount || 0));
  
  // Auto-calculate recurring fees total
  if (this.recurring_fees) {
    this.recurring_fees.total_monthly = 
      (this.recurring_fees.tuition_fee || 0) + 
      (this.recurring_fees.activity_fee || 0) + 
      (this.recurring_fees.transport_fee || 0);
  }
  
  // Update attendance percentage
  if (this.attendance.total_days > 0) {
    this.attendance.attendance_percentage = 
      (this.attendance.present_days / this.attendance.total_days) * 100;
  }
  
  // Clean up authorized_pickup - if transport is not Walker, set to null
  if (this.transport_type !== 'Walker') {
    this.authorized_pickup = null;
  }
  
  // If authorized_pickup exists and all fields are empty/null, set to null
  if (this.authorized_pickup) {
    const hasAnyValue = this.authorized_pickup.name || 
                        this.authorized_pickup.relationship || 
                        this.authorized_pickup.phone;
    if (!hasAnyValue) {
      this.authorized_pickup = null;
    }
  }
  
  // Set default academic_year if not provided
  if (!this.academic_year) {
    const currentYear = new Date().getFullYear();
    this.academic_year = `${currentYear}-${currentYear + 1}`;
  }
  
  // Set default start month for recurring fees if not set
  if (this.recurring_fees && !this.recurring_fees.start_month) {
    this.recurring_fees.start_month = new Date().toISOString().slice(0, 7);
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
      update.camera_fee !== undefined ||
      update.discount !== undefined) {
    
    const reg = update.registration_fee || 0;
    const adm = update.admission_fee || 0;
    const tui = update.tuition_fee || 0;
    const act = update.activity_fee || 0;
    const kit = update.kit_fee || 0;
    const cab = update.cab_fee || 0;
    const cam = update.camera_fee || 0;
    const discount = update.discount || 0;
    const subtotal = reg + adm + tui + act + kit + cab + cam;
    update.total_amount = Math.max(0, subtotal - discount);
  }
  
  // Update recurring fees total
  if (update.recurring_fees) {
    const rf = update.recurring_fees;
    rf.total_monthly = (rf.tuition_fee || 0) + (rf.activity_fee || 0) + (rf.transport_fee || 0);
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

// ==================== FEE RELATED METHODS ====================

// Get current month's fee breakdown
studentSchema.methods.getCurrentMonthFee = function() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return {
    tuition_fee: this.recurring_fees?.tuition_fee || 0,
    activity_fee: this.recurring_fees?.activity_fee || 0,
    transport_fee: this.recurring_fees?.transport_fee || 0,
    total: this.recurring_fees?.total_monthly || 0,
    month: currentMonth,
  };
};

// Get fee due for a specific month
studentSchema.methods.getFeeForMonth = function(month) {
  const Fee = mongoose.model('Fee');
  return Fee.findOne({
    student_id: this._id,
    'fee_period.month': month,
  });
};

// Get all fee invoices for student
studentSchema.methods.getAllFees = function() {
  const Fee = mongoose.model('Fee');
  return Fee.find({ student_id: this._id }).sort({ due_date: -1 });
};

// Get fee summary for student
studentSchema.methods.getFeeSummary = async function() {
  const Fee = mongoose.model('Fee');
  const fees = await Fee.find({ student_id: this._id });
  
  const summary = {
    total_charged: 0,
    total_paid: 0,
    total_remaining: 0,
    total_overdue: 0,
    total_advance: 0,
    invoices: fees.length,
    paid_invoices: fees.filter(f => f.status === 'Paid').length,
    pending_invoices: fees.filter(f => f.status === 'Pending' || f.status === 'Partial').length,
    overdue_invoices: fees.filter(f => f.status === 'Overdue').length,
  };
  
  fees.forEach(fee => {
    summary.total_charged += fee.total_amount || 0;
    summary.total_paid += fee.paid_amount || 0;
    summary.total_remaining += fee.remaining_amount || 0;
    summary.total_overdue += fee.overdue_amount || 0;
    summary.total_advance += fee.advance_amount || 0;
  });
  
  return summary;
};

// Record a fee payment
studentSchema.methods.recordFeePayment = async function(paymentData) {
  const { amount, method, invoice_number, invoice_id, payment_type, notes, recorded_by } = paymentData;
  
  this.fee_payment_history.push({
    amount,
    date: new Date(),
    method,
    invoice_number: invoice_number || '',
    invoice_id: invoice_id || null,
    payment_type: payment_type || 'full',
    notes: notes || '',
    recorded_by: recorded_by || null,
  });
  
  await this.save();
  return this.fee_payment_history[this.fee_payment_history.length - 1];
};

// Check if fee is fully paid for current month
studentSchema.methods.isCurrentMonthFeePaid = async function() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const Fee = mongoose.model('Fee');
  const fee = await Fee.findOne({
    student_id: this._id,
    'fee_period.month': currentMonth,
  });
  
  if (!fee) return false;
  return fee.status === 'Paid';
};

// Create initial invoice for student
studentSchema.methods.createInitialInvoice = async function(paymentData) {
  const Fee = mongoose.model('Fee');
  const { amount, payment_date, payment_method, transaction_id, notes } = paymentData;
  
  // Check if initial invoice already exists
  const existingInvoice = await Fee.findOne({
    student_id: this._id,
    status: 'Paid',
    'notes': /Initial invoice/,
  });
  
  if (existingInvoice) {
    return { success: false, message: 'Initial invoice already exists', invoice: existingInvoice };
  }
  
  // Calculate total recurring amount for the initial month
  const monthlyTotal = this.recurring_fees?.total_monthly || 0;
  const startMonth = this.recurring_fees?.start_month || new Date().toISOString().slice(0, 7);
  
  // Create the invoice
  const invoiceData = {
    student_id: this._id,
    registration_fee: this.registration_fee || 0,
    admission_fee: this.admission_fee || 0,
    tuition_fee: this.recurring_fees?.tuition_fee || 0,
    activity_fee: this.recurring_fees?.activity_fee || 0,
    transport_fee: this.recurring_fees?.transport_fee || 0,
    total_amount: amount || monthlyTotal,
    due_date: new Date(),
    status: 'Paid',
    payment_date: payment_date ? new Date(payment_date) : new Date(),
    payment_method: payment_method || 'Cash',
    transaction_id: transaction_id || '',
    notes: notes || `Initial invoice for ${this.name} - ${startMonth}`,
    fee_period: {
      start_date: new Date(startMonth + '-01'),
      end_date: new Date(new Date(startMonth + '-01').setMonth(new Date(startMonth + '-01').getMonth() + 1) - 1),
      month: startMonth,
    },
    fee_plan: this.recurring_fees?.fee_plan || 'Monthly',
    is_recurring: true,
    generated_for_month: startMonth,
    paid_amount: amount || monthlyTotal,
    remaining_amount: 0,
    advance_amount: 0,
    overdue_amount: 0,
    recurring_fees: {
      tuition_fee: this.recurring_fees?.tuition_fee || 0,
      activity_fee: this.recurring_fees?.activity_fee || 0,
      transport_fee: this.recurring_fees?.transport_fee || 0,
      total_monthly: this.recurring_fees?.total_monthly || 0,
    },
  };
  
  const invoice = new Fee(invoiceData);
  await invoice.save();
  
  // Record payment in student's payment history
  await this.recordFeePayment({
    amount: amount || monthlyTotal,
    method: payment_method || 'Cash',
    invoice_number: invoice.invoice_number,
    invoice_id: invoice._id,
    payment_type: 'initial',
    notes: notes || `Initial payment for ${this.name}`,
  });
  
  // Update student's recurring fees initial payment info
  this.recurring_fees.initial_payment = {
    amount: amount || monthlyTotal,
    paid: true,
    payment_date: payment_date ? new Date(payment_date) : new Date(),
    payment_method: payment_method || 'Cash',
    invoice_id: invoice._id,
    transaction_id: transaction_id || '',
  };
  
  // Update last generated month
  this.recurring_fees.last_generated_month = startMonth;
  
  await this.save();
  
  return { success: true, invoice, message: 'Initial invoice created and marked as paid' };
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

// Get students with recurring fees due for generation
studentSchema.statics.getStudentsForRecurringFeeGeneration = async function(month) {
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  
  return await this.find({
    status: 'Active',
    'recurring_fees.auto_generate': true,
    'recurring_fees.total_monthly': { $gt: 0 },
    $or: [
      { 'recurring_fees.last_generated_month': { $ne: targetMonth } },
      { 'recurring_fees.last_generated_month': null },
    ],
    $or: [
      { 'recurring_fees.start_month': { $lte: targetMonth } },
      { 'recurring_fees.start_month': null },
    ],
    $or: [
      { 'recurring_fees.end_month': { $gte: targetMonth } },
      { 'recurring_fees.end_month': null },
    ],
  }).select('name class_id recurring_fees');
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

// Virtual for fee status
studentSchema.virtual('feeStatus').get(function() {
  const total = this.total_amount || 0;
  const paid = this.fee_paid ? total : 0;
  
  if (total === 0) return 'No Fee Configured';
  if (paid >= total) return 'Fully Paid';
  if (paid > 0) return 'Partial Paid';
  return 'Unpaid';
});

// Ensure virtuals are included in JSON output
studentSchema.set('toJSON', { virtuals: true });
studentSchema.set('toObject', { virtuals: true });

// ==================== INDEXES ====================

studentSchema.index({ class_id: 1, status: 1 });
studentSchema.index({ 'leave_balances.sick.remaining': 1 });
studentSchema.index({ 'attendance.attendance_percentage': -1 });
studentSchema.index({ status: 1, created_at: -1 });
studentSchema.index({ parent_phone: 1 });
studentSchema.index({ parent_email: 1 });
studentSchema.index({ 'emergency_contact.phone': 1 });
studentSchema.index({ 'authorized_pickup.phone': 1 });
studentSchema.index({ admission_date: 1 });
studentSchema.index({ academic_year: 1 });
studentSchema.index({ enrollment_type: 1 });
studentSchema.index({ 'recurring_fees.auto_generate': 1 });
studentSchema.index({ 'recurring_fees.total_monthly': 1 });

module.exports = mongoose.model('Student', studentSchema);