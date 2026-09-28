const express = require('express');
const router = express.Router();
const Fee = require('../models/Fee');
const Expense = require('../models/Expense');
const Salary = require('../models/Salary');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// Returns a plain object with live status/balance merged in.
const toLive = (feeDoc) =>
  feeDoc && typeof feeDoc.toLiveJSON === 'function' ? feeDoc.toLiveJSON() : feeDoc;

const monthKey = (offset = 0) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Creates the recurring invoice for a month if it doesn't exist yet.
const ensureInvoiceForMonth = async (student, monthStr) => {
  const rf = student.recurring_fees || {};
  const monthly =
    (rf.tuition_fee || 0) + (rf.activity_fee || 0) + (rf.transport_fee || 0);
  if (monthly <= 0) return null;

  const existing = await Fee.findOne({
    student_id: student._id,
    'fee_period.month': monthStr,
    is_recurring: true,
  });
  if (existing) return existing;

  return Fee.generateRecurringInvoices(
    student._id,
    monthStr,
    {
      tuition_fee: rf.tuition_fee || 0,
      activity_fee: rf.activity_fee || 0,
      transport_fee: rf.transport_fee || 0,
    },
    rf.monthly_due_day || 5
  );
};

// ==================== FEE MANAGEMENT ====================

router.get('/fees', async (req, res) => {
  try {
    const {
      status, studentId, startDate, endDate, month,
      page = 1,
      limit = 1000,            // was 50 — this was hiding October invoices
    } = req.query;

    let query = {};
    if (status && status !== 'all') query.status = status;
    if (studentId) query.student_id = studentId;
    if (month) query['fee_period.month'] = month;
    if (startDate || endDate) {
      query.due_date = {};
      if (startDate) query.due_date.$gte = new Date(startDate);
      if (endDate) query.due_date.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [fees, total] = await Promise.all([
      Fee.find(query)
        .populate('student_id', 'name parent_name parent_phone class_id')
        .sort({ due_date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Fee.countDocuments(query),
    ]);

    res.json({
      data: fees.map(toLive),
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error('Error fetching fees:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== FEE SUMMARY - MUST COME BEFORE /fees/:id ====================
router.get('/fees/:id/summary', async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.id)
      .populate('student_id', 'name class_id');
    
    if (!fee) {
      return res.status(404).json({ 
        success: false, 
        message: 'Fee record not found' 
      });
    }

    const live = fee.computeLiveStatus();

    let suggestedPaymentType = 'full';
    if (live.remaining_amount > 0 && (fee.paid_amount || 0) > 0) suggestedPaymentType = 'partial';

    res.json({
      success: true,
      data: {
        fee_id: fee._id,
        student_name: fee.student_id?.name || 'Unknown',
        student_class: fee.student_id?.class_id || 'N/A',
        invoice_number: fee.invoice_number,
        fee_period: fee.fee_period,
        due_date: fee.due_date,
        total_amount: fee.total_amount || 0,
        paid_amount: fee.paid_amount || 0,
        remaining_amount: live.remaining_amount,   // always payable
        amount_due: live.amount_due,               // 0 before due date
        balance_due: live.amount_due,
        overdue_amount: live.overdue_amount,
        advance_amount: live.advance_amount,
        status: live.status,
        payment_phase: live.phase,
        is_overdue: live.phase === 'Overdue' && live.remaining_amount > 0,
        is_upcoming: live.phase === 'Upcoming',
        suggested_payment_type: suggestedPaymentType,
      },
    });
  } catch (error) {
    console.error('Error fetching fee summary:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ==================== GET PAYMENT HISTORY - MUST COME BEFORE /fees/:id ====================
router.get('/fees/:id/payments', async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.id)
      .populate('student_id', 'name parent_name class_id recurring_fees')
      .select('payment_history student_id total_amount paid_amount remaining_amount overdue_amount advance_amount status invoice_number invoice_date fee_period due_date');

    if (!fee) {
      return res.status(404).json({ 
        success: false, 
        message: 'Fee record not found' 
      });
    }

    const live = fee.computeLiveStatus();

    const relatedInvoices = await Fee.find({
      student_id: fee.student_id._id,
      _id: { $ne: fee._id },
    })
    .select('invoice_number total_amount paid_amount status due_date fee_period')
    .sort({ due_date: -1 });

    res.json({
      success: true,
      data: {
        fee: {
          _id: fee._id,
          invoice_number: fee.invoice_number,
          invoice_date: fee.invoice_date,
          fee_period: fee.fee_period,
          due_date: fee.due_date,
          total_amount: fee.total_amount,
          paid_amount: fee.paid_amount,
          remaining_amount: live.remaining_amount,
          amount_due: live.amount_due,
          balance_due: live.amount_due,
          overdue_amount: live.overdue_amount,
          advance_amount: live.advance_amount,
          status: live.status,
          payment_phase: live.phase,
        },
        student: fee.student_id,
        related_invoices: relatedInvoices.map(toLive),
        payment_history: fee.payment_history.sort((a, b) => b.recorded_at - a.recorded_at),
      },
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ==================== GET FEE BY ID - MUST COME AFTER SPECIFIC ROUTES ====================
router.get('/fees/:id', async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.id)
      .populate('student_id', 'name parent_name parent_phone class_id recurring_fees');
    
    if (!fee) {
      return res.status(404).json({ message: 'Fee record not found' });
    }
    
    const relatedFees = await Fee.find({
      student_id: fee.student_id._id,
      _id: { $ne: fee._id },
    }).sort({ due_date: -1 });
    
    res.json({
      ...toLive(fee),
      related_invoices: relatedFees.map(toLive),
    });
  } catch (error) {
    console.error('Error fetching fee:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/fees/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { month, ensureUpcoming } = req.query;

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    // Make sure the current + next 2 months' invoices exist so the admin can
    // always pick e.g. October's invoice and record an early payment.
    if (ensureUpcoming === 'true') {
      for (const m of [monthKey(0), monthKey(1), monthKey(2)]) {
        try { await ensureInvoiceForMonth(student, m); }
        catch (e) { console.error('ensureInvoice failed', m, e.message); }
      }
    }

    const query = { student_id: studentId };
    if (month) query['fee_period.month'] = month;

    const fees = await Fee.find(query).sort({ due_date: 1 });
    const liveFees = fees.map(toLive);

    const sum = (k) => liveFees.reduce((s, f) => s + (f[k] || 0), 0);

    const currentMonthFeeDoc = await Fee.findOne({
      student_id: studentId,
      'fee_period.month': monthKey(0),
    });

    res.json({
      student: {
        id: student._id,
        name: student.name,
        class_id: student.class_id,
        recurring_fees: student.recurring_fees,
      },
      summary: {
        total_charged: sum('total_amount'),
        total_paid: sum('paid_amount'),
        total_remaining: sum('remaining_amount'),
        total_amount_due: sum('amount_due'),
        total_overdue: sum('overdue_amount'),
        total_advance: sum('advance_amount'),
        current_month_fee: currentMonthFeeDoc ? toLive(currentMonthFeeDoc) : null,
      },
      invoices: liveFees,
    });
  } catch (error) {
    console.error('Error fetching student fees:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== RECURRING FEE GENERATION ====================

router.post('/fees/generate-recurring', async (req, res) => {
  try {
    const { studentId, months = 1, startMonth } = req.body;
    
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    if (!student.recurring_fees || student.recurring_fees.total_monthly === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No recurring fees configured for this student' 
      });
    }

    const dueDay = student.recurring_fees.monthly_due_day || 5;
    const startDate = startMonth ? new Date(startMonth + '-01') : new Date();
    const generatedInvoices = [];
    
    for (let i = 0; i < months; i++) {
      const month = new Date(startDate);
      month.setMonth(month.getMonth() + i);
      const monthStr = month.toISOString().slice(0, 7);
      
      const existingInvoice = await Fee.findOne({
        student_id: studentId,
        'fee_period.month': monthStr,
        is_recurring: true,
      });
      
      if (!existingInvoice) {
        const invoice = await Fee.generateRecurringInvoices(
          studentId,
          monthStr,
          {
            tuition_fee: student.recurring_fees.tuition_fee || 0,
            activity_fee: student.recurring_fees.activity_fee || 0,
            transport_fee: student.recurring_fees.transport_fee || 0,
          },
          dueDay
        );
        generatedInvoices.push(invoice);
      }
    }
    
    res.json({
      success: true,
      message: `Generated ${generatedInvoices.length} recurring invoices`,
      invoices: generatedInvoices.map(toLive),
    });
  } catch (error) {
    console.error('Error generating recurring fees:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// New endpoint: create the invoice for a specific month
router.post('/fees/ensure-invoice', async (req, res) => {
  try {
    const { student_id, month } = req.body;   // month = 'YYYY-MM'
    if (!student_id || !/^\d{4}-\d{2}$/.test(month || '')) {
      return res.status(400).json({ success: false, message: 'student_id and month (YYYY-MM) are required' });
    }
    const student = await Student.findById(student_id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const invoice = await ensureInvoiceForMonth(student, month);
    if (!invoice) {
      return res.status(400).json({ success: false, message: 'No recurring fees configured for this student' });
    }
    res.json({ success: true, invoice: toLive(invoice) });
  } catch (error) {
    console.error('Error ensuring invoice:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== PAYMENT RECORDING WITH ADVANCE HANDLING ====================

router.post('/fees/record-payment', async (req, res) => {
  try {
    const {
      student_id,
      fee_id,
      amount_paid,
      payment_date,
      payment_method,
      transaction_no,
      notes,
      recorded_by,
      advance_allocation,
      generate_future_invoices = false,
    } = req.body;

    if (!fee_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Fee record ID is required' 
      });
    }

    if (!amount_paid || amount_paid <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid payment amount is required' 
      });
    }

    const fee = await Fee.findById(fee_id);
    if (!fee) {
      return res.status(404).json({ 
        success: false, 
        message: 'Fee record not found' 
      });
    }

    const totalAmount = fee.total_amount || 0;
    const paidAmount = fee.paid_amount || 0;
    const remaining = totalAmount - paidAmount;
    
    let paymentType = 'full';
    if (amount_paid > remaining) {
      paymentType = 'advance';
    } else if (amount_paid < remaining) {
      paymentType = 'partial';
    } else {
      paymentType = 'full';
    }

    let advanceAllocation = [];
    if (paymentType === 'advance' || amount_paid > remaining) {
      const advanceAmount = amount_paid - (remaining > 0 ? remaining : 0);
      
      if (advanceAmount > 0 && advance_allocation && advance_allocation.length > 0) {
        const totalAllocated = advance_allocation.reduce((sum, a) => sum + a.amount, 0);
        if (totalAllocated !== advanceAmount) {
          return res.status(400).json({
            success: false,
            message: `Advance allocation total (${totalAllocated}) does not match advance amount (${advanceAmount})`,
          });
        }
        
        advanceAllocation = advance_allocation;
        
        if (generate_future_invoices) {
          const student = await Student.findById(student_id);
          const dueDay = student?.recurring_fees?.monthly_due_day || 5;
          if (student && student.recurring_fees) {
            for (const allocation of advanceAllocation) {
              const existingInvoice = await Fee.findOne({
                student_id,
                'fee_period.month': allocation.month,
                is_recurring: true,
              });
              
              if (!existingInvoice) {
                const invoice = await Fee.generateRecurringInvoices(
                  student_id,
                  allocation.month,
                  {
                    tuition_fee: student.recurring_fees.tuition_fee || 0,
                    activity_fee: student.recurring_fees.activity_fee || 0,
                    transport_fee: student.recurring_fees.transport_fee || 0,
                  },
                  dueDay
                );
                
                await invoice.recordPayment({
                  amount: allocation.amount,
                  payment_method,
                  transaction_id: transaction_no || '',
                  payment_type: 'advance',
                  notes: `Advance payment allocated from ${fee.invoice_number}`,
                  recorded_by,
                });
              }
            }
          }
        }
      }
    }

    // If the extra is being allocated to future invoices, only the invoice's own
    // remaining amount goes on this invoice; the rest was paid onto those invoices above.
    const allocatedTotal = advanceAllocation.reduce((s, a) => s + (a.amount || 0), 0);
    const amountForThisInvoice = allocatedTotal > 0 ? amount_paid - allocatedTotal : amount_paid;

    const paymentData = {
      amount: amountForThisInvoice,
      payment_date: payment_date ? new Date(payment_date) : new Date(),
      payment_method: payment_method || 'Cash',
      transaction_id: transaction_no || '',
      payment_type: paymentType,
      notes: notes || '',
      recorded_by: recorded_by || null,
      advance_allocation: advanceAllocation,
    };

    await fee.recordPayment(paymentData);

    const updatedFee = await Fee.findById(fee_id)
      .populate('student_id', 'name parent_name class_id');

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: toLive(updatedFee),
      payment_type: paymentType,
    });

  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ==================== ADVANCE PAYMENT ALLOCATION ====================

router.post('/fees/allocate-advance', async (req, res) => {
  try {
    const { fee_id, allocations } = req.body;
    
    const fee = await Fee.findById(fee_id);
    if (!fee) {
      return res.status(404).json({ success: false, message: 'Fee record not found' });
    }
    
    if (fee.payment_history.length > 0) {
      const lastPayment = fee.payment_history[fee.payment_history.length - 1];
      lastPayment.advance_allocation = allocations;
      await fee.save();
    }
    
    res.json({
      success: true,
      message: 'Advance payment allocated successfully',
      allocations,
    });
  } catch (error) {
    console.error('Error allocating advance payment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== BULK FEE OPERATIONS ====================

router.post('/fees/bulk-generate-recurring', async (req, res) => {
  try {
    const { month, students = [] } = req.body;
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    
    let query = {};
    if (students.length > 0) {
      query._id = { $in: students };
    }
    
    const studentList = await Student.find(query);
    const generatedInvoices = [];
    const errors = [];
    
    for (const student of studentList) {
      try {
        if (student.recurring_fees && student.recurring_fees.total_monthly > 0) {
          const existingInvoice = await Fee.findOne({
            student_id: student._id,
            'fee_period.month': targetMonth,
            is_recurring: true,
          });
          
          if (!existingInvoice) {
            const dueDay = student.recurring_fees.monthly_due_day || 5;
            const invoice = await Fee.generateRecurringInvoices(
              student._id,
              targetMonth,
              {
                tuition_fee: student.recurring_fees.tuition_fee || 0,
                activity_fee: student.recurring_fees.activity_fee || 0,
                transport_fee: student.recurring_fees.transport_fee || 0,
              },
              dueDay
            );
            generatedInvoices.push(invoice);
          }
        }
      } catch (error) {
        errors.push({ student: student.name, error: error.message });
      }
    }
    
    res.json({
      success: true,
      message: `Generated ${generatedInvoices.length} invoices for ${studentList.length} students`,
      generated: generatedInvoices.length,
      errors,
    });
  } catch (error) {
    console.error('Error bulk generating recurring fees:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== FEE CRUD ====================

router.post('/fees', async (req, res) => {
  try {
    const {
      student_id,
      registration_fee,
      admission_fee,
      tuition_fee,
      transport_fee,
      activity_fee,
      kit_fee,
      camera_fee,
      total_amount,
      due_date,
      status,
      payment_date,
      payment_method,
      transaction_id,
      notes,
      receipt_url,
      fee_period,
      fee_plan,
      is_recurring,
      recurring_fees,
    } = req.body;
    
    const student = await Student.findById(student_id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    let uploadedReceipt = null;
    if (receipt_url) {
      uploadedReceipt = await uploadToCloudinary(receipt_url, 'finance/receipts');
    }

    const oneTimeTotal =
      (registration_fee || 0) + (admission_fee || 0) + (tuition_fee || 0) +
      (transport_fee || 0) + (activity_fee || 0) + (kit_fee || 0) + (camera_fee || 0);
    const recurringTotal =
      (recurring_fees?.tuition_fee || 0) + (recurring_fees?.activity_fee || 0) +
      (recurring_fees?.transport_fee || 0);
    const computedTotal = total_amount || oneTimeTotal || recurringTotal || 0;

    // If status is manually set to 'Paid' when creating a record (no
    // record-payment call involved), treat it as fully paid so the
    // date-driven status calculation agrees with it.
    const paidAmount = status === 'Paid' ? computedTotal : 0;
    
    const feeData = {
      student_id,
      registration_fee: registration_fee || 0,
      admission_fee: admission_fee || 0,
      tuition_fee: tuition_fee || 0,
      transport_fee: transport_fee || 0,
      activity_fee: activity_fee || 0,
      kit_fee: kit_fee || 0,
      camera_fee: camera_fee || 0,
      total_amount: computedTotal,
      paid_amount: paidAmount,
      due_date: new Date(due_date),
      payment_date: status === 'Paid' ? (payment_date ? new Date(payment_date) : new Date()) : (payment_date ? new Date(payment_date) : null),
      payment_method: payment_method || 'Cash',
      transaction_id: transaction_id || '',
      notes: notes || '',
      receipt_url: uploadedReceipt,
      fee_period: fee_period || { month: due_date?.slice(0, 7) || new Date().toISOString().slice(0, 7) },
      fee_plan: fee_plan || 'Monthly',
      is_recurring: is_recurring || false,
      recurring_fees: recurring_fees || { tuition_fee: 0, activity_fee: 0, transport_fee: 0, total_monthly: 0, monthly_due_day: 5 },
    };
    
    const fee = new Fee(feeData);
    const savedFee = await fee.save();
    
    const populatedFee = await Fee.findById(savedFee._id)
      .populate('student_id', 'name parent_name class_id');
    
    res.status(201).json(toLive(populatedFee));
  } catch (error) {
    console.error('Error creating fee record:', error);
    res.status(400).json({ message: error.message });
  }
});

router.put('/fees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingFee = await Fee.findById(id);
    
    if (!existingFee) {
      return res.status(404).json({ message: 'Fee record not found' });
    }
    
    const {
      registration_fee,
      admission_fee,
      tuition_fee,
      transport_fee,
      activity_fee,
      kit_fee,
      camera_fee,
      total_amount,
      due_date,
      status,
      payment_date,
      payment_method,
      transaction_id,
      notes,
      receipt_url,
      fee_period,
      fee_plan,
      recurring_fees,
    } = req.body;
    
    let uploadedReceipt = existingFee.receipt_url;
    if (receipt_url && receipt_url !== existingFee.receipt_url) {
      if (existingFee.receipt_url) {
        await deleteFromCloudinary(existingFee.receipt_url);
      }
      uploadedReceipt = await uploadToCloudinary(receipt_url, 'finance/receipts');
    }

    const recurringTotal =
      (recurring_fees?.tuition_fee || 0) + (recurring_fees?.activity_fee || 0) +
      (recurring_fees?.transport_fee || 0);
    const computedTotal = total_amount || recurringTotal || existingFee.total_amount || 0;

    // Manually flipping status to 'Paid' marks it fully paid; otherwise keep
    // whatever paid_amount already exists (payments are normally recorded
    // via the record-payment endpoint, not this form).
    const paidAmount = status === 'Paid' ? computedTotal : (existingFee.paid_amount || 0);
    
    const feeData = {
      registration_fee: registration_fee || 0,
      admission_fee: admission_fee || 0,
      tuition_fee: tuition_fee || 0,
      transport_fee: transport_fee || 0,
      activity_fee: activity_fee || 0,
      kit_fee: kit_fee || 0,
      camera_fee: camera_fee || 0,
      total_amount: computedTotal,
      paid_amount: paidAmount,
      due_date: new Date(due_date),
      payment_date: status === 'Paid' ? (payment_date ? new Date(payment_date) : new Date()) : (payment_date ? new Date(payment_date) : existingFee.payment_date),
      payment_method: payment_method || existingFee.payment_method,
      transaction_id: transaction_id || '',
      notes: notes || '',
      receipt_url: uploadedReceipt,
      fee_period: fee_period || existingFee.fee_period,
      fee_plan: fee_plan || existingFee.fee_plan,
      recurring_fees: recurring_fees || existingFee.recurring_fees,
      updated_at: Date.now(),
    };
    
    const fee = await Fee.findById(id);
    Object.assign(fee, feeData);
    await fee.save();

    const populated = await Fee.findById(id).populate('student_id', 'name parent_name class_id');
    
    res.json(toLive(populated));
  } catch (error) {
    console.error('Error updating fee record:', error);
    res.status(400).json({ message: error.message });
  }
});

router.delete('/fees/:id', async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.id);
    
    if (!fee) {
      return res.status(404).json({ message: 'Fee record not found' });
    }
    
    if (fee.receipt_url) {
      await deleteFromCloudinary(fee.receipt_url);
    }
    
    await Fee.findByIdAndDelete(req.params.id);
    res.json({ message: 'Fee record deleted successfully' });
  } catch (error) {
    console.error('Error deleting fee record:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== EXPENSE MANAGEMENT ====================

router.get('/expenses', async (req, res) => {
  try {
    const { category, startDate, endDate, page = 1, limit = 50 } = req.query;
    let query = {};
    
    if (category && category !== 'all') {
      query.category = category;
    }
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [expenses, total] = await Promise.all([
      Expense.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Expense.countDocuments(query),
    ]);
    
    res.json({
      data: expenses,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/expenses/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    res.json(expense);
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/expenses', async (req, res) => {
  try {
    const {
      category,
      description,
      amount,
      date,
      vendor_name,
      bill_number,
      payment_mode,
      receipt_url,
      notes,
    } = req.body;
    
    let uploadedReceipt = null;
    if (receipt_url) {
      uploadedReceipt = await uploadToCloudinary(receipt_url, 'finance/expenses');
    }
    
    const expenseData = {
      category,
      description,
      amount,
      date: new Date(date),
      vendor_name: vendor_name || '',
      bill_number: bill_number || '',
      payment_mode: payment_mode || 'Cash',
      receipt_url: uploadedReceipt,
      notes: notes || '',
    };
    
    const expense = new Expense(expenseData);
    const savedExpense = await expense.save();
    
    res.status(201).json(savedExpense);
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(400).json({ message: error.message });
  }
});

router.put('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingExpense = await Expense.findById(id);
    
    if (!existingExpense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    const {
      category,
      description,
      amount,
      date,
      vendor_name,
      bill_number,
      payment_mode,
      receipt_url,
      notes,
    } = req.body;
    
    let uploadedReceipt = existingExpense.receipt_url;
    if (receipt_url && receipt_url !== existingExpense.receipt_url) {
      if (existingExpense.receipt_url) {
        await deleteFromCloudinary(existingExpense.receipt_url);
      }
      uploadedReceipt = await uploadToCloudinary(receipt_url, 'finance/expenses');
    }
    
    const expenseData = {
      category,
      description,
      amount,
      date: new Date(date),
      vendor_name: vendor_name || '',
      bill_number: bill_number || '',
      payment_mode,
      receipt_url: uploadedReceipt,
      notes: notes || '',
      updated_at: Date.now(),
    };
    
    const expense = await Expense.findByIdAndUpdate(
      id,
      expenseData,
      { new: true, runValidators: true }
    );
    
    res.json(expense);
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(400).json({ message: error.message });
  }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    if (expense.receipt_url) {
      await deleteFromCloudinary(expense.receipt_url);
    }
    
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== SALARY MANAGEMENT ====================

router.get('/salaries', async (req, res) => {
  try {
    const { status, staffId, month, page = 1, limit = 50 } = req.query;
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    if (staffId) {
      query.staff_id = staffId;
    }
    if (month) {
      const startDate = new Date(month);
      const endDate = new Date(month);
      endDate.setMonth(endDate.getMonth() + 1);
      query.month = { $gte: startDate, $lt: endDate };
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [salaries, total] = await Promise.all([
      Salary.find(query)
        .populate('staff_id', 'name designation department')
        .sort({ month: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Salary.countDocuments(query),
    ]);
    
    res.json({
      data: salaries,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching salaries:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/salaries/:id', async (req, res) => {
  try {
    const salary = await Salary.findById(req.params.id)
      .populate('staff_id', 'name designation department salary account_number bank_name');
    
    if (!salary) {
      return res.status(404).json({ message: 'Salary record not found' });
    }
    
    res.json(salary);
  } catch (error) {
    console.error('Error fetching salary:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/salaries/staff/:staffId', async (req, res) => {
  try {
    const { staffId } = req.params;
    const salaries = await Salary.find({ staff_id: staffId })
      .sort({ month: -1 });
    
    res.json(salaries);
  } catch (error) {
    console.error('Error fetching staff salaries:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/salaries', async (req, res) => {
  try {
    const {
      staff_id,
      month,
      basic_salary,
      allowance,
      deductions,
      net_salary,
      status,
      payment_date,
      payment_method,
      transaction_id,
      remarks,
      salary_slip_url,
    } = req.body;
    
    const staff = await Staff.findById(staff_id);
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }
    
    const startOfMonth = new Date(month);
    const endOfMonth = new Date(month);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    
    const existingSalary = await Salary.findOne({
      staff_id,
      month: { $gte: startOfMonth, $lt: endOfMonth }
    });
    
    if (existingSalary) {
      return res.status(400).json({ message: 'Salary already processed for this staff in the selected month' });
    }
    
    let uploadedSlip = null;
    if (salary_slip_url) {
      uploadedSlip = await uploadToCloudinary(salary_slip_url, 'finance/salary_slips');
    }
    
    const salaryData = {
      staff_id,
      month: new Date(month),
      basic_salary,
      allowance: allowance || 0,
      deductions: deductions || 0,
      net_salary,
      status: status || 'Pending',
      payment_date: payment_date ? new Date(payment_date) : null,
      payment_method: payment_method || 'Bank Transfer',
      transaction_id: transaction_id || '',
      remarks: remarks || '',
      salary_slip_url: uploadedSlip,
    };
    
    const salary = new Salary(salaryData);
    const savedSalary = await salary.save();
    
    const populatedSalary = await Salary.findById(savedSalary._id)
      .populate('staff_id', 'name designation');
    
    res.status(201).json(populatedSalary);
  } catch (error) {
    console.error('Error creating salary record:', error);
    res.status(400).json({ message: error.message });
  }
});

router.put('/salaries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingSalary = await Salary.findById(id);
    
    if (!existingSalary) {
      return res.status(404).json({ message: 'Salary record not found' });
    }
    
    const {
      basic_salary,
      allowance,
      deductions,
      net_salary,
      status,
      payment_date,
      payment_method,
      transaction_id,
      remarks,
      salary_slip_url,
    } = req.body;
    
    let uploadedSlip = existingSalary.salary_slip_url;
    if (salary_slip_url && salary_slip_url !== existingSalary.salary_slip_url) {
      if (existingSalary.salary_slip_url) {
        await deleteFromCloudinary(existingSalary.salary_slip_url);
      }
      uploadedSlip = await uploadToCloudinary(salary_slip_url, 'finance/salary_slips');
    }
    
    const salaryData = {
      basic_salary,
      allowance: allowance || 0,
      deductions: deductions || 0,
      net_salary,
      status,
      payment_date: payment_date ? new Date(payment_date) : null,
      payment_method,
      transaction_id: transaction_id || '',
      remarks: remarks || '',
      salary_slip_url: uploadedSlip,
      updated_at: Date.now(),
    };
    
    const salary = await Salary.findByIdAndUpdate(
      id,
      salaryData,
      { new: true, runValidators: true }
    ).populate('staff_id', 'name designation');
    
    res.json(salary);
  } catch (error) {
    console.error('Error updating salary record:', error);
    res.status(400).json({ message: error.message });
  }
});

router.delete('/salaries/:id', async (req, res) => {
  try {
    const salary = await Salary.findById(req.params.id);
    
    if (!salary) {
      return res.status(404).json({ message: 'Salary record not found' });
    }
    
    if (salary.salary_slip_url) {
      await deleteFromCloudinary(salary.salary_slip_url);
    }
    
    await Salary.findByIdAndDelete(req.params.id);
    res.json({ message: 'Salary record deleted successfully' });
  } catch (error) {
    console.error('Error deleting salary record:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== FINANCIAL DASHBOARD STATISTICS ====================

router.get('/dashboard/overview', async (req, res) => {
  try {
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    const totalFeesCollected = await Fee.aggregate([
      { $group: { _id: null, total: { $sum: '$paid_amount' } } }
    ]);

    const monthlyFeesCollected = await Fee.aggregate([
      { $unwind: '$payment_history' },
      { $match: { 'payment_history.recorded_at': { $gte: startOfMonth, $lte: new Date(endOfMonth.getTime() + 86399999) } } },
      { $group: { _id: null, total: { $sum: '$payment_history.amount' } } }
    ]);

    const pendingFees = await Fee.aggregate([
      { $match: { remaining_amount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$remaining_amount' } } }
    ]);

    const overdueFees = await Fee.countDocuments({ overdue_amount: { $gt: 0 } });
    
    const totalExpenses = await Expense.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const monthlyExpenses = await Expense.aggregate([
      { $match: { date: { $gte: startOfMonth, $lte: endOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const expensesByCategory = await Expense.aggregate([
      { $group: { _id: '$category', total: { $sum: '$amount' } } }
    ]);
    
    const totalSalaryPaid = await Salary.aggregate([
      { $match: { status: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$net_salary' } } }
    ]);
    
    const monthlySalaryPaid = await Salary.aggregate([
      { $match: { status: 'Completed', payment_date: { $gte: startOfMonth, $lte: endOfMonth } } },
      { $group: { _id: null, total: { $sum: '$net_salary' } } }
    ]);
    
    const pendingSalary = await Salary.aggregate([
      { $match: { status: 'Pending' } },
      { $group: { _id: null, total: { $sum: '$net_salary' } } }
    ]);
    
    const totalIncome = totalFeesCollected[0]?.total || 0;
    const totalOutcome = (totalExpenses[0]?.total || 0) + (totalSalaryPaid[0]?.total || 0);
    const netBalance = totalIncome - totalOutcome;
    
    res.json({
      fees: {
        totalCollected: totalFeesCollected[0]?.total || 0,
        monthlyCollected: monthlyFeesCollected[0]?.total || 0,
        pending: pendingFees[0]?.total || 0,
        overdue: overdueFees,
      },
      expenses: {
        total: totalExpenses[0]?.total || 0,
        monthly: monthlyExpenses[0]?.total || 0,
        byCategory: expensesByCategory,
      },
      salaries: {
        totalPaid: totalSalaryPaid[0]?.total || 0,
        monthlyPaid: monthlySalaryPaid[0]?.total || 0,
        pending: pendingSalary[0]?.total || 0,
      },
      netBalance,
    });
  } catch (error) {
    console.error('Error fetching financial overview:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/reports/monthly', async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();
    const months = [];
    
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(targetYear, month, 1);
      const endDate = new Date(targetYear, month + 1, 0);
      
      const feesCollected = await Fee.aggregate([
        { $unwind: '$payment_history' },
        { $match: { 'payment_history.recorded_at': { $gte: startDate, $lte: new Date(endDate.getTime() + 86399999) } } },
        { $group: { _id: null, total: { $sum: '$payment_history.amount' } } }
      ]);
      
      const expenses = await Expense.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      
      const salaries = await Salary.aggregate([
        { $match: { status: 'Completed', payment_date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: null, total: { $sum: '$net_salary' } } }
      ]);
      
      months.push({
        month: startDate.toLocaleString('default', { month: 'long' }),
        year: targetYear,
        feesCollected: feesCollected[0]?.total || 0,
        expenses: expenses[0]?.total || 0,
        salaries: salaries[0]?.total || 0,
        netProfit: (feesCollected[0]?.total || 0) - (expenses[0]?.total || 0) - (salaries[0]?.total || 0),
      });
    }
    
    res.json(months);
  } catch (error) {
    console.error('Error fetching monthly report:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== DOCUMENT UPLOAD ====================

router.post('/upload', async (req, res) => {
  try {
    const { document, type } = req.body;
    
    if (!document) {
      return res.status(400).json({ message: 'No document provided' });
    }
    
    let folder = 'finance';
    switch (type) {
      case 'receipt': folder = 'finance/receipts'; break;
      case 'expense': folder = 'finance/expenses'; break;
      case 'salary': folder = 'finance/salary_slips'; break;
      default: folder = 'finance';
    }
    
    const uploadedUrl = await uploadToCloudinary(document, folder);
    
    res.json({ url: uploadedUrl });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;