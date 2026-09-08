const mongoose = require('mongoose');

const feeSchema = new mongoose.Schema({
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true,
  },
  
  // Fee components (matching student schema)
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
  transport_fee: {
    type: Number,
    default: 0, // Maps to cab_fee from student
  },
  camera_fee: {
    type: Number,
    default: 0,
  },
  
  // Recurring fees (monthly)
  recurring_fees: {
    tuition_fee: { type: Number, default: 0 },
    activity_fee: { type: Number, default: 0 },
    transport_fee: { type: Number, default: 0 },
    total_monthly: { type: Number, default: 0 },
  },
  
  // Fee period
  fee_period: {
    start_date: { type: Date },
    end_date: { type: Date },
    month: { type: String }, // Format: YYYY-MM
  },
  
  // Fee plan reference
  fee_plan: {
    type: String,
    enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'One-Time'],
    default: 'Monthly',
  },
  
  total_amount: {
    type: Number,
    default: 0,
  },
  
  // Payment tracking
  paid_amount: {
    type: Number,
    default: 0,
  },
  remaining_amount: {
    type: Number,
    default: 0,
  },
  advance_amount: {
    type: Number,
    default: 0,
  },
  overdue_amount: {
    type: Number,
    default: 0,
  },
  
  due_date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Overdue', 'Partial', 'Advance'],
    default: 'Pending',
  },
  
  // Payment details
  payment_date: {
    type: Date,
    default: null,
  },
  payment_method: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'],
    default: 'Cash',
  },
  transaction_id: {
    type: String,
    default: '',
  },
  
  // Payment history with invoice references
  payment_history: [{
    amount: {
      type: Number,
      required: true,
    },
    payment_date: {
      type: Date,
      default: Date.now,
    },
    payment_method: {
      type: String,
      enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'],
      required: true,
    },
    transaction_id: {
      type: String,
      default: '',
    },
    payment_type: {
      type: String,
      enum: ['full', 'partial', 'advance', 'recurring'],
      required: true,
    },
    invoice_id: {
      type: String,
      default: '',
    },
    invoice_number: {
      type: String,
      default: '',
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
    recorded_at: {
      type: Date,
      default: Date.now,
    },
    // For advance payments mapping to future months
    advance_allocation: [{
      month: { type: String }, // YYYY-MM
      amount: { type: Number },
      invoice_id: { type: String },
    }],
  }],
  
  // Invoice details
  invoice_number: {
    type: String,
    unique: true,
    sparse: true,
  },
  invoice_date: {
    type: Date,
    default: Date.now,
  },
  invoice_url: {
    type: String,
    default: null,
  },
  
  // Additional info
  notes: {
    type: String,
    default: '',
  },
  receipt_url: {
    type: String,
    default: null,
  },
  
  // For recurring fee tracking
  is_recurring: {
    type: Boolean,
    default: false,
  },
  parent_fee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fee',
    default: null,
  },
  child_fee_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fee',
  }],
  generated_for_month: {
    type: String, // Format: YYYY-MM
    default: null,
  },
  
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for faster queries
feeSchema.index({ student_id: 1, due_date: -1 });
feeSchema.index({ status: 1 });
feeSchema.index({ invoice_number: 1 });
feeSchema.index({ generated_for_month: 1 });
feeSchema.index({ 'fee_period.month': 1 });

// Auto-generate invoice number before save
feeSchema.pre('save', async function(next) {
  this.updated_at = Date.now();
  
  // Auto-calculate total amount
  this.total_amount = 
    (this.registration_fee || 0) + 
    (this.admission_fee || 0) + 
    (this.tuition_fee || 0) + 
    (this.activity_fee || 0) + 
    (this.kit_fee || 0) + 
    (this.transport_fee || 0) + 
    (this.camera_fee || 0);
  
  // Calculate recurring total
  this.recurring_fees.total_monthly = 
    (this.recurring_fees.tuition_fee || 0) + 
    (this.recurring_fees.activity_fee || 0) + 
    (this.recurring_fees.transport_fee || 0);
  
  // Calculate remaining amount
  this.remaining_amount = this.total_amount - (this.paid_amount || 0);
  this.overdue_amount = this.due_date && new Date() > new Date(this.due_date) ? this.remaining_amount : 0;
  
  // Update status based on payment
  if (this.remaining_amount <= 0 && this.paid_amount > 0) {
    this.status = 'Paid';
  } else if (this.paid_amount > 0 && this.remaining_amount > 0) {
    this.status = 'Partial';
  } else if (this.advance_amount > 0 && this.remaining_amount <= 0) {
    this.status = 'Advance';
  }
  
  // Generate invoice number if not exists
  if (!this.invoice_number) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const count = await mongoose.model('Fee').countDocuments();
    this.invoice_number = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }
  
  next();
});

// Method to record a payment
feeSchema.methods.recordPayment = function(paymentData) {
  const { 
    amount, 
    payment_method, 
    transaction_id, 
    payment_type, 
    notes, 
    recorded_by,
    invoice_number,
    advance_allocation,
  } = paymentData;
  
  // Add to payment history
  this.payment_history.push({
    amount,
    payment_date: new Date(),
    payment_method,
    transaction_id: transaction_id || '',
    payment_type,
    invoice_number: invoice_number || this.invoice_number,
    notes: notes || '',
    recorded_by: recorded_by || null,
    advance_allocation: advance_allocation || [],
  });
  
  // Update paid amount
  this.paid_amount = (this.paid_amount || 0) + amount;
  
  // Track advance payment
  if (payment_type === 'advance' && advance_allocation) {
    this.advance_amount = (this.advance_amount || 0) + amount;
    // Allocate advance to future months
    for (const allocation of advance_allocation) {
      // This will be handled by the route to create future invoices
    }
  }
  
  this.remaining_amount = this.total_amount - this.paid_amount;
  
  // Update overdue amount
  this.overdue_amount = this.due_date && new Date() > new Date(this.due_date) ? this.remaining_amount : 0;
  
  // Update status
  if (this.remaining_amount <= 0) {
    this.status = 'Paid';
    this.payment_date = new Date();
    this.payment_method = payment_method;
    this.transaction_id = transaction_id || '';
  } else if (this.paid_amount > 0) {
    this.status = 'Partial';
  }
  
  return this.save();
};

// Method to generate recurring invoices
feeSchema.statics.generateRecurringInvoices = async function(studentId, month, fees) {
  const { tuition_fee, activity_fee, transport_fee } = fees;
  
  const totalMonthly = (tuition_fee || 0) + (activity_fee || 0) + (transport_fee || 0);
  
  const invoice = new this({
    student_id: studentId,
    recurring_fees: {
      tuition_fee: tuition_fee || 0,
      activity_fee: activity_fee || 0,
      transport_fee: transport_fee || 0,
      total_monthly: totalMonthly,
    },
    tuition_fee: tuition_fee || 0,
    activity_fee: activity_fee || 0,
    transport_fee: transport_fee || 0,
    total_amount: totalMonthly,
    due_date: new Date(month + '-01'),
    fee_period: {
      start_date: new Date(month + '-01'),
      end_date: new Date(new Date(month + '-01').setMonth(new Date(month + '-01').getMonth() + 1) - 1),
      month: month,
    },
    fee_plan: 'Monthly',
    is_recurring: true,
    generated_for_month: month,
    status: 'Pending',
  });
  
  await invoice.save();
  return invoice;
};

module.exports = mongoose.model('Fee', feeSchema);