const express = require('express');
const router = express.Router();
const Fee = require('../models/Fee');
const Expense = require('../models/Expense');
const Salary = require('../models/Salary');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// ==================== FEE MANAGEMENT ====================

// Get all fees with filters
router.get('/fees', async (req, res) => {
  try {
    const { status, studentId, startDate, endDate } = req.query;
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    if (studentId) {
      query.student_id = studentId;
    }
    if (startDate || endDate) {
      query.due_date = {};
      if (startDate) query.due_date.$gte = new Date(startDate);
      if (endDate) query.due_date.$lte = new Date(endDate);
    }
    
    const fees = await Fee.find(query)
      .populate('student_id', 'name parent_name parent_phone class_id')
      .populate('created_by', 'name email')
      .sort({ due_date: 1 });
    
    res.json(fees);
  } catch (error) {
    console.error('Error fetching fees:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get fee by ID
router.get('/fees/:id', async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.id)
      .populate('student_id', 'name parent_name parent_phone class_id')
      .populate('created_by', 'name email');
    
    if (!fee) {
      return res.status(404).json({ message: 'Fee record not found' });
    }
    
    res.json(fee);
  } catch (error) {
    console.error('Error fetching fee:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get fees by student
router.get('/fees/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const fees = await Fee.find({ student_id: studentId })
      .sort({ due_date: -1 });
    
    res.json(fees);
  } catch (error) {
    console.error('Error fetching student fees:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create fee record
router.post('/fees', async (req, res) => {
  try {
    const {
      student_id,
      admission_fee,
      tuition_fee,
      transport_fee,
      activity_fee,
      total_amount,
      due_date,
      status,
      payment_date,
      payment_method,
      transaction_id,
      notes,
      receipt_url,
      created_by,
    } = req.body;
    
    // Check if student exists
    const student = await Student.findById(student_id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Upload receipt if provided
    let uploadedReceipt = null;
    if (receipt_url) {
      uploadedReceipt = await uploadToCloudinary(receipt_url, 'finance/receipts');
    }
    
    const feeData = {
      student_id,
      admission_fee: admission_fee || 0,
      tuition_fee: tuition_fee || 0,
      transport_fee: transport_fee || 0,
      activity_fee: activity_fee || 0,
      total_amount,
      due_date: new Date(due_date),
      status: status || 'Pending',
      payment_date: payment_date ? new Date(payment_date) : null,
      payment_method: payment_method || 'Cash',
      transaction_id: transaction_id || '',
      notes: notes || '',
      receipt_url: uploadedReceipt,
      created_by: created_by || null,
    };
    
    const fee = new Fee(feeData);
    const savedFee = await fee.save();
    
    const populatedFee = await Fee.findById(savedFee._id)
      .populate('student_id', 'name parent_name');
    
    res.status(201).json(populatedFee);
  } catch (error) {
    console.error('Error creating fee record:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update fee record
router.put('/fees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingFee = await Fee.findById(id);
    
    if (!existingFee) {
      return res.status(404).json({ message: 'Fee record not found' });
    }
    
    const {
      admission_fee,
      tuition_fee,
      transport_fee,
      activity_fee,
      total_amount,
      due_date,
      status,
      payment_date,
      payment_method,
      transaction_id,
      notes,
      receipt_url,
    } = req.body;
    
    // Handle receipt update
    let uploadedReceipt = existingFee.receipt_url;
    if (receipt_url && receipt_url !== existingFee.receipt_url) {
      if (existingFee.receipt_url) {
        await deleteFromCloudinary(existingFee.receipt_url);
      }
      uploadedReceipt = await uploadToCloudinary(receipt_url, 'finance/receipts');
    }
    
    const feeData = {
      admission_fee: admission_fee || 0,
      tuition_fee: tuition_fee || 0,
      transport_fee: transport_fee || 0,
      activity_fee: activity_fee || 0,
      total_amount,
      due_date: new Date(due_date),
      status,
      payment_date: payment_date ? new Date(payment_date) : null,
      payment_method,
      transaction_id: transaction_id || '',
      notes: notes || '',
      receipt_url: uploadedReceipt,
      updated_at: Date.now(),
    };
    
    const fee = await Fee.findByIdAndUpdate(
      id,
      feeData,
      { new: true, runValidators: true }
    ).populate('student_id', 'name parent_name');
    
    res.json(fee);
  } catch (error) {
    console.error('Error updating fee record:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete fee record
router.delete('/fees/:id', async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.id);
    
    if (!fee) {
      return res.status(404).json({ message: 'Fee record not found' });
    }
    
    // Delete receipt from Cloudinary
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

// Get all expenses with filters
router.get('/expenses', async (req, res) => {
  try {
    const { category, startDate, endDate } = req.query;
    let query = {};
    
    if (category && category !== 'all') {
      query.category = category;
    }
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const expenses = await Expense.find(query)
      .populate('created_by', 'name email')
      .populate('approved_by', 'name email')
      .sort({ date: -1 });
    
    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get expense by ID
router.get('/expenses/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('created_by', 'name email')
      .populate('approved_by', 'name email');
    
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    res.json(expense);
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create expense
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
      approved_by,
      notes,
      created_by,
    } = req.body;
    
    // Upload receipt if provided
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
      approved_by: approved_by || null,
      notes: notes || '',
      created_by: created_by || null,
    };
    
    const expense = new Expense(expenseData);
    const savedExpense = await expense.save();
    
    const populatedExpense = await Expense.findById(savedExpense._id)
      .populate('created_by', 'name email');
    
    res.status(201).json(populatedExpense);
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update expense
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
      approved_by,
      notes,
    } = req.body;
    
    // Handle receipt update
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
      approved_by: approved_by || null,
      notes: notes || '',
      updated_at: Date.now(),
    };
    
    const expense = await Expense.findByIdAndUpdate(
      id,
      expenseData,
      { new: true, runValidators: true }
    ).populate('created_by', 'name email');
    
    res.json(expense);
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete expense
router.delete('/expenses/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    // Delete receipt from Cloudinary
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

// Get all salaries with filters
router.get('/salaries', async (req, res) => {
  try {
    const { status, staffId, month } = req.query;
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
    
    const salaries = await Salary.find(query)
      .populate('staff_id', 'name designation department')
      .populate('created_by', 'name email')
      .sort({ month: -1 });
    
    res.json(salaries);
  } catch (error) {
    console.error('Error fetching salaries:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get salary by ID
router.get('/salaries/:id', async (req, res) => {
  try {
    const salary = await Salary.findById(req.params.id)
      .populate('staff_id', 'name designation department salary account_number bank_name')
      .populate('created_by', 'name email');
    
    if (!salary) {
      return res.status(404).json({ message: 'Salary record not found' });
    }
    
    res.json(salary);
  } catch (error) {
    console.error('Error fetching salary:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get salaries by staff
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

// Create salary record
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
      created_by,
    } = req.body;
    
    // Check if staff exists
    const staff = await Staff.findById(staff_id);
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }
    
    // Check if salary already exists for this staff in this month
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
    
    // Upload salary slip if provided
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
      created_by: created_by || null,
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

// Update salary record
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
    
    // Handle salary slip update
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

// Delete salary record
router.delete('/salaries/:id', async (req, res) => {
  try {
    const salary = await Salary.findById(req.params.id);
    
    if (!salary) {
      return res.status(404).json({ message: 'Salary record not found' });
    }
    
    // Delete salary slip from Cloudinary
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

// Get financial overview
router.get('/dashboard/overview', async (req, res) => {
  try {
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    // Fee statistics
    const totalFeesCollected = await Fee.aggregate([
      { $match: { status: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$total_amount' } } }
    ]);
    
    const monthlyFeesCollected = await Fee.aggregate([
      { $match: { status: 'Paid', payment_date: { $gte: startOfMonth, $lte: endOfMonth } } },
      { $group: { _id: null, total: { $sum: '$total_amount' } } }
    ]);
    
    const pendingFees = await Fee.aggregate([
      { $match: { status: { $in: ['Pending', 'Overdue'] } } },
      { $group: { _id: null, total: { $sum: '$total_amount' } } }
    ]);
    
    const overdueFees = await Fee.countDocuments({ status: 'Overdue' });
    
    // Expense statistics
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
    
    // Salary statistics
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
    
    // Net balance
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

// Get monthly financial report
router.get('/reports/monthly', async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();
    const months = [];
    
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(targetYear, month, 1);
      const endDate = new Date(targetYear, month + 1, 0);
      
      const feesCollected = await Fee.aggregate([
        { $match: { status: 'Paid', payment_date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } }
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

// Upload receipt/invoice
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