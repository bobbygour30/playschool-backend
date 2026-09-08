// routes/students.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Fee = require('../models/Fee');
const { STANDARD_CLASSES } = require('../utils/classHelper');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// Helper function to convert to ObjectId safely
const toObjectId = (id) => {
  if (!id) return null;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch (error) {
    return id;
  }
};

// Helper function to sync student to mobile backend
const syncStudentToMobile = async (studentData, isDelete = false) => {
  if (!process.env.MOBILE_BACKEND_URL) {
    console.log('MOBILE_BACKEND_URL not configured, skipping sync');
    return { success: false, error: 'Mobile backend URL not configured' };
  }

  try {
    if (isDelete) {
      const response = await axios.delete(
        `${process.env.MOBILE_BACKEND_URL}/api/sync/student/${studentData._id}`,
        {
          headers: {
            'X-Sync-Key': process.env.SYNC_SECRET_KEY
          }
        }
      );
      return { success: true, data: response.data };
    } else {
      const payload = {
        name: studentData.name,
        rollNumber: studentData.rollNumber,
        class_id: studentData.class_id,
        section: studentData.section || 'A',
        parent_name: studentData.parent_name,
        parent_relationship: studentData.parent_relationship || 'Mother',
        parent_phone: studentData.parent_phone,
        parent_email: studentData.parent_email,
        date_of_birth: studentData.date_of_birth,
        gender: studentData.gender,
        blood_group: studentData.blood_group,
        address: studentData.address,
        status: studentData.status,
        registration_fee: studentData.registration_fee || 0,
        admission_fee: studentData.admission_fee || 0,
        tuition_fee: studentData.tuition_fee || 0,
        activity_fee: studentData.activity_fee || 0,
        kit_fee: studentData.kit_fee || 0,
        cab_fee: studentData.cab_fee || 0,
        camera_fee: studentData.camera_fee || 0,
        fee_frequency: studentData.fee_frequency || 'Monthly',
        discount: studentData.discount || 0,
        total_amount: studentData.total_amount || 0,
        fee_paid: studentData.fee_paid || false,
        payment_date: studentData.payment_date || null,
        payment_mode: studentData.payment_mode || 'Cash',
        emergency_contact: studentData.emergency_contact || {},
        authorized_pickup: studentData.authorized_pickup || null,
        documents: studentData.documents || {},
        admission_date: studentData.admission_date || null,
        academic_year: studentData.academic_year || '',
        enrollment_type: studentData.enrollment_type || 'New Admission',
        previous_class: studentData.previous_class || '',
        // Recurring fees
        recurring_fees: studentData.recurring_fees || {},
      };
      
      const response = await axios.post(
        `${process.env.MOBILE_BACKEND_URL}/api/sync/student`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Sync-Key': process.env.SYNC_SECRET_KEY
          }
        }
      );
      return { success: true, data: response.data };
    }
  } catch (error) {
    console.error('Sync to mobile error:', error.message);
    return { success: false, error: error.message };
  }
};

// Helper function to create initial fee invoice and payment record
const createInitialFeeInvoice = async (studentData, paymentInfo) => {
  try {
    const Fee = require('../models/Fee');
    
    // Check if initial invoice already exists
    const existingInvoice = await Fee.findOne({
      student_id: studentData._id,
      status: 'Paid',
      'notes': /Initial invoice/,
    });
    
    if (existingInvoice) {
      return { success: false, message: 'Initial invoice already exists', invoice: existingInvoice };
    }
    
    // Calculate monthly total from recurring fees
    const monthlyTotal = (studentData.recurring_fees?.total_monthly || 0);
    const amount = paymentInfo?.initial_payment_amount || monthlyTotal;
    const paymentMethod = paymentInfo?.payment_mode || 'Cash';
    const paymentDate = paymentInfo?.payment_date || new Date();
    const transactionId = paymentInfo?.transaction_id || '';
    const startMonth = studentData.recurring_fees?.start_month || new Date().toISOString().slice(0, 7);
    
    // Create the invoice
    const invoiceData = {
      student_id: studentData._id,
      registration_fee: studentData.registration_fee || 0,
      admission_fee: studentData.admission_fee || 0,
      tuition_fee: studentData.recurring_fees?.tuition_fee || 0,
      activity_fee: studentData.recurring_fees?.activity_fee || 0,
      transport_fee: studentData.recurring_fees?.transport_fee || 0,
      total_amount: amount,
      due_date: new Date(),
      status: 'Paid',
      payment_date: paymentDate,
      payment_method: paymentMethod,
      transaction_id: transactionId,
      notes: `Initial invoice for ${studentData.name} - ${startMonth}`,
      fee_period: {
        start_date: new Date(startMonth + '-01'),
        end_date: new Date(new Date(startMonth + '-01').setMonth(new Date(startMonth + '-01').getMonth() + 1) - 1),
        month: startMonth,
      },
      fee_plan: studentData.recurring_fees?.fee_plan || 'Monthly',
      is_recurring: true,
      generated_for_month: startMonth,
      paid_amount: amount,
      remaining_amount: 0,
      advance_amount: 0,
      overdue_amount: 0,
      recurring_fees: {
        tuition_fee: studentData.recurring_fees?.tuition_fee || 0,
        activity_fee: studentData.recurring_fees?.activity_fee || 0,
        transport_fee: studentData.recurring_fees?.transport_fee || 0,
        total_monthly: studentData.recurring_fees?.total_monthly || 0,
      },
    };
    
    const invoice = new Fee(invoiceData);
    await invoice.save();
    
    // Update student's fee_paid status
    studentData.fee_paid = true;
    studentData.payment_date = paymentDate;
    studentData.payment_mode = paymentMethod;
    studentData.total_amount = amount;
    
    // Update recurring fees initial payment info
    studentData.recurring_fees.initial_payment = {
      amount: amount,
      paid: true,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      invoice_id: invoice._id,
      transaction_id: transactionId,
    };
    
    // Update last generated month
    studentData.recurring_fees.last_generated_month = startMonth;
    
    await studentData.save();
    
    return { success: true, invoice, message: 'Initial invoice created and marked as paid' };
  } catch (error) {
    console.error('Error creating initial invoice:', error);
    return { success: false, error: error.message };
  }
};

// Helper function to sync student fees to finance module
const syncStudentFeesToFinance = async (studentData, isUpdate = false) => {
  try {
    let existingFee = await Fee.findOne({ 
      student_id: studentData._id 
    });
    
    // Check if there's already an initial invoice
    const initialInvoice = await Fee.findOne({
      student_id: studentData._id,
      status: 'Paid',
      'notes': /Initial invoice/,
    });
    
    const subtotal = 
      (studentData.registration_fee || 0) + 
      (studentData.admission_fee || 0) + 
      (studentData.tuition_fee || 0) + 
      (studentData.activity_fee || 0) + 
      (studentData.kit_fee || 0) + 
      (studentData.cab_fee || 0) + 
      (studentData.camera_fee || 0);
    const totalAmount = Math.max(0, subtotal - (studentData.discount || 0));
    
    // If there's an initial invoice, use that status
    let status = studentData.fee_paid ? 'Paid' : 'Pending';
    let paidAmount = 0;
    let remainingAmount = totalAmount;
    
    if (initialInvoice) {
      status = 'Paid';
      paidAmount = initialInvoice.total_amount || totalAmount;
      remainingAmount = Math.max(0, totalAmount - paidAmount);
    }
    
    const feeData = {
      student_id: studentData._id,
      registration_fee: studentData.registration_fee || 0,
      admission_fee: studentData.admission_fee || 0,
      tuition_fee: studentData.tuition_fee || 0,
      activity_fee: studentData.activity_fee || 0,
      kit_fee: studentData.kit_fee || 0,
      transport_fee: studentData.cab_fee || 0,
      camera_fee: studentData.camera_fee || 0,
      fee_frequency: studentData.fee_frequency || 'Monthly',
      discount: studentData.discount || 0,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      remaining_amount: remainingAmount,
      due_date: studentData.enrollment_date || new Date(),
      status: status,
      payment_date: studentData.payment_date || null,
      payment_method: studentData.payment_mode || 'Cash',
      notes: initialInvoice ? 
        `Auto-created from student registration - ${studentData.name} (Initial invoice: ${initialInvoice.invoice_number})` :
        `Auto-created from student registration - ${studentData.name}`,
      fee_period: {
        month: new Date().toISOString().slice(0, 7),
        start_date: new Date(),
        end_date: new Date(new Date().setMonth(new Date().getMonth() + 1) - 1),
      },
      fee_plan: studentData.recurring_fees?.fee_plan || 'Monthly',
      is_recurring: true,
      recurring_fees: {
        tuition_fee: studentData.recurring_fees?.tuition_fee || 0,
        activity_fee: studentData.recurring_fees?.activity_fee || 0,
        transport_fee: studentData.recurring_fees?.transport_fee || 0,
        total_monthly: studentData.recurring_fees?.total_monthly || 0,
      },
    };
    
    if (existingFee) {
      // Don't override if there's an initial invoice
      if (!initialInvoice || existingFee.status === 'Pending') {
        const updatedFee = await Fee.findByIdAndUpdate(
          existingFee._id,
          { 
            ...feeData,
            updated_at: Date.now() 
          },
          { new: true, runValidators: true }
        );
        return { success: true, data: updatedFee, action: 'updated' };
      }
      return { success: true, data: existingFee, action: 'skipped' };
    } else {
      const newFee = new Fee(feeData);
      await newFee.save();
      return { success: true, data: newFee, action: 'created' };
    }
  } catch (error) {
    console.error('Error syncing student fees to finance:', error.message);
    return { success: false, error: error.message };
  }
};

// ==================== GET ALL STUDENTS ====================
router.get('/', async (req, res) => {
  try {
    const students = await Student.find()
      .populate({
        path: 'assigned_teacher_id',
        model: 'Staff',
        select: 'name designation email phone role department'
      })
      .sort({ created_at: -1 });
    
    const studentsWithClass = students.map(student => {
      const studentObj = student.toObject();
      const classObj = STANDARD_CLASSES[student.class_id];
      studentObj.class_name = classObj || student.class_id || 'N/A';
      return studentObj;
    });
    
    res.json(studentsWithClass);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET STUDENTS BY CLASS ====================
router.get('/class/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const students = await Student.find({ class_id: classId })
      .populate({
        path: 'assigned_teacher_id',
        model: 'Staff',
        select: 'name designation'
      });
    
    res.json(students);
  } catch (error) {
    console.error('Error fetching students by class:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET STUDENT BY ID ====================
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate({
        path: 'assigned_teacher_id',
        model: 'Staff',
        select: 'name designation email phone role'
      });
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    const studentObj = student.toObject();
    const classObj = STANDARD_CLASSES[student.class_id];
    studentObj.class_name = classObj || student.class_id || 'N/A';
    
    res.json(studentObj);
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET STUDENTS BY TEACHER ====================
router.get('/teacher/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    const students = await Student.find({ 
      $or: [
        { assigned_teacher_id: teacherId },
        { assigned_teacher_id: toObjectId(teacherId) }
      ]
    }).populate({
      path: 'assigned_teacher_id',
      model: 'Staff',
      select: 'name designation email phone role'
    });
    
    res.json(students);
  } catch (error) {
    console.error('Error fetching students by teacher:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET CLASS-WISE STATISTICS ====================
router.get('/stats/class-wise', async (req, res) => {
  try {
    const classes = ['toddler', 'pre-nursery', 'nursery', 'kg-1'];
    const stats = {};
    
    for (const className of classes) {
      const count = await Student.countDocuments({ class_id: className });
      const activeCount = await Student.countDocuments({ class_id: className, status: 'Active' });
      stats[className] = { total: count, active: activeCount };
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching class-wise stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET FEE STATISTICS ====================
router.get('/stats/fee-summary', async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const paidStudents = await Student.countDocuments({ fee_paid: true });
    const unpaidStudents = await Student.countDocuments({ fee_paid: false });
    
    const feeResult = await Student.aggregate([
      { $group: {
        _id: null,
        totalRegistrationFee: { $sum: '$registration_fee' },
        totalAdmissionFee: { $sum: '$admission_fee' },
        totalTuitionFee: { $sum: '$tuition_fee' },
        totalActivityFee: { $sum: '$activity_fee' },
        totalKitFee: { $sum: '$kit_fee' },
        totalCabFee: { $sum: '$cab_fee' },
        totalCameraFee: { $sum: '$camera_fee' },
        totalDiscount: { $sum: '$discount' },
        totalAmount: { $sum: '$total_amount' },
        paidAmount: { $sum: { $cond: ['$fee_paid', '$total_amount', 0] } },
        unpaidAmount: { $sum: { $cond: ['$fee_paid', 0, '$total_amount'] } }
      }}
    ]);
    
    const stats = feeResult[0] || {
      totalRegistrationFee: 0,
      totalAdmissionFee: 0,
      totalTuitionFee: 0,
      totalActivityFee: 0,
      totalKitFee: 0,
      totalCabFee: 0,
      totalCameraFee: 0,
      totalDiscount: 0,
      totalAmount: 0,
      paidAmount: 0,
      unpaidAmount: 0
    };
    
    res.json({
      totalStudents,
      paidStudents,
      unpaidStudents,
      ...stats
    });
  } catch (error) {
    console.error('Error fetching fee summary:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET FEE BREAKDOWN BY STUDENT ====================
router.get('/fee-breakdown/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    res.json({
      student_name: student.name,
      registration_fee: student.registration_fee || 0,
      admission_fee: student.admission_fee || 0,
      tuition_fee: student.tuition_fee || 0,
      activity_fee: student.activity_fee || 0,
      kit_fee: student.kit_fee || 0,
      cab_fee: student.cab_fee || 0,
      camera_fee: student.camera_fee || 0,
      fee_frequency: student.fee_frequency || 'Monthly',
      discount: student.discount || 0,
      total_amount: student.total_amount || 0,
      fee_paid: student.fee_paid,
      payment_date: student.payment_date,
      payment_mode: student.payment_mode,
      recurring_fees: student.recurring_fees || {},
    });
  } catch (error) {
    console.error('Error fetching fee breakdown:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== CREATE STUDENT ====================
router.post('/', async (req, res) => {
  try {
    const {
      name,
      date_of_birth,
      gender,
      blood_group,
      class_id,
      section,
      assigned_teacher_id,
      parent_name,
      parent_relationship,
      parent_email,
      parent_phone,
      parent_aadhar,
      address,
      emergency_contact,
      medical_info,
      enrollment_date,
      admission_date,
      academic_year,
      enrollment_type,
      previous_class,
      transport_type,
      vehicle_id,
      vendor_id,
      status,
      documents,
      registration_fee,
      admission_fee,
      tuition_fee,
      activity_fee,
      kit_fee,
      cab_fee,
      camera_fee,
      fee_frequency,
      discount,
      fee_paid,
      payment_date,
      payment_mode,
      authorized_pickup,
      // Recurring fees fields
      recurring_fees,
    } = req.body;
    
    // Validate mandatory documents
    if (!documents?.student_photo) {
      return res.status(400).json({ message: 'Student Photo is mandatory' });
    }
    if (!documents?.birth_certificate) {
      return res.status(400).json({ message: 'Birth Certificate is mandatory' });
    }
    if (!documents?.parent_aadhar_front) {
      return res.status(400).json({ message: 'Parent Aadhar (Front) is mandatory' });
    }
    if (!documents?.parent_aadhar_back) {
      return res.status(400).json({ message: 'Parent Aadhar (Back) is mandatory' });
    }
    
    // Validate emergency contact
    if (!emergency_contact?.name || !emergency_contact?.relationship || !emergency_contact?.phone) {
      return res.status(400).json({ message: 'Emergency Contact is required with name, relationship, and phone' });
    }
    if (!/^\d{10}$/.test(emergency_contact.phone)) {
      return res.status(400).json({ message: 'Emergency Contact phone must be exactly 10 digits' });
    }
    
    // Validate enrollment information
    if (!admission_date) {
      return res.status(400).json({ message: 'Admission Date is required' });
    }
    if (!academic_year) {
      return res.status(400).json({ message: 'Academic Year is required' });
    }
    if (!enrollment_type) {
      return res.status(400).json({ message: 'Enrollment Type is required' });
    }
    
    // Validate previous class for Transfer or Returning
    if ((enrollment_type === 'Transfer' || enrollment_type === 'Returning') && !previous_class) {
      return res.status(400).json({ 
        message: 'Previous Class is required for Transfer or Returning students' 
      });
    }
    
    // Validate authorized pickup if Walker and has data
    if (transport_type === 'Walker' && authorized_pickup) {
      if (authorized_pickup.phone && !/^\d{10}$/.test(authorized_pickup.phone)) {
        return res.status(400).json({ message: 'Authorized Pickup phone must be exactly 10 digits' });
      }
    }
    
    // Verify teacher exists if provided
    if (assigned_teacher_id) {
      const teacherExists = await Staff.findById(assigned_teacher_id);
      if (!teacherExists) {
        return res.status(400).json({ message: 'Selected teacher does not exist' });
      }
    }
    
    // Upload documents to Cloudinary if provided
    const uploadedDocuments = {};
    
    if (documents) {
      if (documents.student_photo) {
        uploadedDocuments.student_photo = await uploadToCloudinary(
          documents.student_photo,
          'students/photos'
        );
      }
      if (documents.birth_certificate) {
        uploadedDocuments.birth_certificate = await uploadToCloudinary(
          documents.birth_certificate,
          'students/birth_certificates'
        );
      }
      if (documents.aadhar_card) {
        uploadedDocuments.aadhar_card = await uploadToCloudinary(
          documents.aadhar_card,
          'students/aadhar_cards'
        );
      }
      if (documents.parent_aadhar_front) {
        uploadedDocuments.parent_aadhar_front = await uploadToCloudinary(
          documents.parent_aadhar_front,
          'students/parent_aadhar'
        );
      }
      if (documents.parent_aadhar_back) {
        uploadedDocuments.parent_aadhar_back = await uploadToCloudinary(
          documents.parent_aadhar_back,
          'students/parent_aadhar'
        );
      }
    }
    
    // Determine class type
    let classType = 'standard';
    if (class_id && !STANDARD_CLASSES[class_id]) {
      classType = 'custom';
    }
    
    // Calculate total amount from all fee components with discount
    const regFee = parseFloat(registration_fee) || 0;
    const admFee = parseFloat(admission_fee) || 0;
    const tuiFee = parseFloat(tuition_fee) || 0;
    const actFee = parseFloat(activity_fee) || 0;
    const kitFee = parseFloat(kit_fee) || 0;
    const cabFee = parseFloat(cab_fee) || 0;
    const camFee = parseFloat(camera_fee) || 0;
    const disc = parseFloat(discount) || 0;
    const subtotal = regFee + admFee + tuiFee + actFee + kitFee + cabFee + camFee;
    const totalAmount = Math.max(0, subtotal - disc);
    
    // Calculate recurring fees total
    const recurringTotal = 
      (recurring_fees?.tuition_fee || 0) + 
      (recurring_fees?.activity_fee || 0) + 
      (recurring_fees?.transport_fee || 0);
    
    const studentData = {
      name,
      date_of_birth: new Date(date_of_birth),
      gender,
      blood_group: blood_group || '',
      class_id: class_id || null,
      section: section || 'A',
      class_type: classType,
      assigned_teacher_id: assigned_teacher_id || null,
      parent_name,
      parent_relationship: parent_relationship || 'Mother',
      parent_email,
      parent_phone,
      parent_aadhar: parent_aadhar || '',
      address,
      emergency_contact: {
        name: emergency_contact.name,
        relationship: emergency_contact.relationship,
        phone: emergency_contact.phone,
      },
      medical_info: medical_info || '',
      enrollment_date: new Date(enrollment_date),
      admission_date: new Date(admission_date),
      academic_year: academic_year,
      enrollment_type: enrollment_type || 'New Admission',
      previous_class: previous_class || '',
      transport_type: transport_type || 'Walker',
      vehicle_id: transport_type !== 'Walker' ? vehicle_id : null,
      vendor_id: transport_type !== 'Walker' ? vendor_id : null,
      status: status || 'Active',
      documents: uploadedDocuments,
      registration_fee: regFee,
      admission_fee: admFee,
      tuition_fee: tuiFee,
      activity_fee: actFee,
      kit_fee: kitFee,
      cab_fee: cabFee,
      camera_fee: camFee,
      fee_frequency: fee_frequency || 'Monthly',
      discount: disc,
      total_amount: totalAmount,
      fee_paid: fee_paid || false,
      payment_date: payment_date ? new Date(payment_date) : null,
      payment_mode: payment_mode || 'Cash',
      // Recurring fees
      recurring_fees: {
        tuition_fee: recurring_fees?.tuition_fee || 0,
        activity_fee: recurring_fees?.activity_fee || 0,
        transport_fee: recurring_fees?.transport_fee || 0,
        total_monthly: recurringTotal,
        start_month: recurring_fees?.start_month || new Date().toISOString().slice(0, 7),
        end_month: recurring_fees?.end_month || null,
        fee_plan: recurring_fees?.fee_plan || 'Monthly',
        auto_generate: recurring_fees?.auto_generate !== undefined ? recurring_fees.auto_generate : true,
        last_generated_month: null,
        initial_payment: {
          amount: 0,
          paid: false,
          payment_date: null,
          payment_method: payment_mode || 'Cash',
          invoice_id: null,
          transaction_id: '',
        },
      },
    };
    
    // Add authorized pickup only if Walker and has data
    if (transport_type === 'Walker' && authorized_pickup) {
      const hasPickupData = authorized_pickup.name || authorized_pickup.relationship || authorized_pickup.phone;
      if (hasPickupData) {
        studentData.authorized_pickup = {
          name: authorized_pickup.name || null,
          relationship: authorized_pickup.relationship || null,
          phone: authorized_pickup.phone || null,
        };
      }
    }
    
    const student = new Student(studentData);
    const savedStudent = await student.save();
    
    // Create initial invoice and payment record if fee is paid or initial payment is provided
    let initialInvoiceResult = null;
    if (fee_paid && recurringTotal > 0) {
      const paymentInfo = {
        initial_payment_amount: totalAmount,
        payment_date: payment_date ? new Date(payment_date) : new Date(),
        payment_mode: payment_mode || 'Cash',
        transaction_id: '',
      };
      initialInvoiceResult = await createInitialFeeInvoice(savedStudent, paymentInfo);
      console.log(`📄 Initial invoice created for ${savedStudent.name}: ${initialInvoiceResult.success ? 'Success' : 'Failed'}`);
    } else if (recurringTotal > 0) {
      // Create the invoice but mark as pending if not paid
      const Fee = require('../models/Fee');
      const startMonth = savedStudent.recurring_fees?.start_month || new Date().toISOString().slice(0, 7);
      
      const invoiceData = {
        student_id: savedStudent._id,
        registration_fee: savedStudent.registration_fee || 0,
        admission_fee: savedStudent.admission_fee || 0,
        tuition_fee: savedStudent.recurring_fees?.tuition_fee || 0,
        activity_fee: savedStudent.recurring_fees?.activity_fee || 0,
        transport_fee: savedStudent.recurring_fees?.transport_fee || 0,
        total_amount: recurringTotal,
        due_date: new Date(),
        status: 'Pending',
        notes: `Initial invoice for ${savedStudent.name} - ${startMonth} (Pending)`,
        fee_period: {
          start_date: new Date(startMonth + '-01'),
          end_date: new Date(new Date(startMonth + '-01').setMonth(new Date(startMonth + '-01').getMonth() + 1) - 1),
          month: startMonth,
        },
        fee_plan: savedStudent.recurring_fees?.fee_plan || 'Monthly',
        is_recurring: true,
        generated_for_month: startMonth,
        paid_amount: 0,
        remaining_amount: recurringTotal,
        advance_amount: 0,
        overdue_amount: 0,
        recurring_fees: {
          tuition_fee: savedStudent.recurring_fees?.tuition_fee || 0,
          activity_fee: savedStudent.recurring_fees?.activity_fee || 0,
          transport_fee: savedStudent.recurring_fees?.transport_fee || 0,
          total_monthly: savedStudent.recurring_fees?.total_monthly || 0,
        },
      };
      
      const invoice = new Fee(invoiceData);
      await invoice.save();
      console.log(`📄 Initial pending invoice created for ${savedStudent.name}`);
    }
    
    // Sync student fees to finance module
    const feeSyncResult = await syncStudentFeesToFinance(savedStudent, false);
    console.log(`💰 Fee sync result for ${savedStudent.name}: ${feeSyncResult.action}`);
    
    // Sync to mobile backend
    const syncResult = await syncStudentToMobile(savedStudent);
    
    // Populate the teacher data before returning
    const populatedStudent = await Student.findById(savedStudent._id)
      .populate({
        path: 'assigned_teacher_id',
        model: 'Staff',
        select: 'name designation email phone role'
      });
    
    const responseData = populatedStudent.toObject();
    responseData.sync = syncResult;
    responseData.feeSync = feeSyncResult;
    responseData.initialInvoice = initialInvoiceResult;
    
    res.status(201).json(responseData);
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== UPDATE STUDENT ====================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingStudent = await Student.findById(id);
    
    if (!existingStudent) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    const {
      name,
      date_of_birth,
      gender,
      blood_group,
      class_id,
      section,
      assigned_teacher_id,
      parent_name,
      parent_relationship,
      parent_email,
      parent_phone,
      parent_aadhar,
      address,
      emergency_contact,
      medical_info,
      enrollment_date,
      admission_date,
      academic_year,
      enrollment_type,
      previous_class,
      transport_type,
      vehicle_id,
      vendor_id,
      status,
      documents,
      registration_fee,
      admission_fee,
      tuition_fee,
      activity_fee,
      kit_fee,
      cab_fee,
      camera_fee,
      fee_frequency,
      discount,
      fee_paid,
      payment_date,
      payment_mode,
      authorized_pickup,
      recurring_fees,
    } = req.body;
    
    // Verify teacher exists if provided
    if (assigned_teacher_id) {
      const teacherExists = await Staff.findById(assigned_teacher_id);
      if (!teacherExists) {
        return res.status(400).json({ message: 'Selected teacher does not exist' });
      }
    }
    
    // Validate emergency contact if provided
    if (emergency_contact) {
      if (!emergency_contact.name || !emergency_contact.relationship || !emergency_contact.phone) {
        return res.status(400).json({ message: 'Emergency Contact requires name, relationship, and phone' });
      }
      if (!/^\d{10}$/.test(emergency_contact.phone)) {
        return res.status(400).json({ message: 'Emergency Contact phone must be exactly 10 digits' });
      }
    }
    
    // Validate enrollment information
    if (admission_date && !academic_year) {
      return res.status(400).json({ message: 'Academic Year is required when Admission Date is provided' });
    }
    
    // Validate previous class for Transfer or Returning
    if ((enrollment_type === 'Transfer' || enrollment_type === 'Returning') && !previous_class) {
      return res.status(400).json({ 
        message: 'Previous Class is required for Transfer or Returning students' 
      });
    }
    
    // Validate authorized pickup if Walker and has data
    if (transport_type === 'Walker' && authorized_pickup) {
      if (authorized_pickup.phone && !/^\d{10}$/.test(authorized_pickup.phone)) {
        return res.status(400).json({ message: 'Authorized Pickup phone must be exactly 10 digits' });
      }
    }
    
    // Handle document updates
    const updatedDocuments = { ...existingStudent.documents };
    
    if (documents) {
      if (documents.student_photo && documents.student_photo !== existingStudent.documents?.student_photo) {
        if (existingStudent.documents?.student_photo) {
          await deleteFromCloudinary(existingStudent.documents.student_photo);
        }
        updatedDocuments.student_photo = await uploadToCloudinary(
          documents.student_photo,
          'students/photos'
        );
      }
      if (documents.birth_certificate && documents.birth_certificate !== existingStudent.documents?.birth_certificate) {
        if (existingStudent.documents?.birth_certificate) {
          await deleteFromCloudinary(existingStudent.documents.birth_certificate);
        }
        updatedDocuments.birth_certificate = await uploadToCloudinary(
          documents.birth_certificate,
          'students/birth_certificates'
        );
      }
      if (documents.aadhar_card && documents.aadhar_card !== existingStudent.documents?.aadhar_card) {
        if (existingStudent.documents?.aadhar_card) {
          await deleteFromCloudinary(existingStudent.documents.aadhar_card);
        }
        updatedDocuments.aadhar_card = await uploadToCloudinary(
          documents.aadhar_card,
          'students/aadhar_cards'
        );
      }
      if (documents.parent_aadhar_front && documents.parent_aadhar_front !== existingStudent.documents?.parent_aadhar_front) {
        if (existingStudent.documents?.parent_aadhar_front) {
          await deleteFromCloudinary(existingStudent.documents.parent_aadhar_front);
        }
        updatedDocuments.parent_aadhar_front = await uploadToCloudinary(
          documents.parent_aadhar_front,
          'students/parent_aadhar'
        );
      }
      if (documents.parent_aadhar_back && documents.parent_aadhar_back !== existingStudent.documents?.parent_aadhar_back) {
        if (existingStudent.documents?.parent_aadhar_back) {
          await deleteFromCloudinary(existingStudent.documents.parent_aadhar_back);
        }
        updatedDocuments.parent_aadhar_back = await uploadToCloudinary(
          documents.parent_aadhar_back,
          'students/parent_aadhar'
        );
      }
    }
    
    // Determine class type
    let classType = 'standard';
    if (class_id && !STANDARD_CLASSES[class_id]) {
      classType = 'custom';
    }
    
    // Calculate total amount from all fee components with discount
    const regFee = parseFloat(registration_fee) !== undefined ? parseFloat(registration_fee) : existingStudent.registration_fee || 0;
    const admFee = parseFloat(admission_fee) !== undefined ? parseFloat(admission_fee) : existingStudent.admission_fee || 0;
    const tuiFee = parseFloat(tuition_fee) !== undefined ? parseFloat(tuition_fee) : existingStudent.tuition_fee || 0;
    const actFee = parseFloat(activity_fee) !== undefined ? parseFloat(activity_fee) : existingStudent.activity_fee || 0;
    const kitFee = parseFloat(kit_fee) !== undefined ? parseFloat(kit_fee) : existingStudent.kit_fee || 0;
    const cabFee = parseFloat(cab_fee) !== undefined ? parseFloat(cab_fee) : existingStudent.cab_fee || 0;
    const camFee = parseFloat(camera_fee) !== undefined ? parseFloat(camera_fee) : existingStudent.camera_fee || 0;
    const disc = parseFloat(discount) !== undefined ? parseFloat(discount) : existingStudent.discount || 0;
    const subtotal = regFee + admFee + tuiFee + actFee + kitFee + cabFee + camFee;
    const totalAmount = Math.max(0, subtotal - disc);
    
    // Calculate recurring fees total
    const recurringTotal = 
      (recurring_fees?.tuition_fee || existingStudent.recurring_fees?.tuition_fee || 0) + 
      (recurring_fees?.activity_fee || existingStudent.recurring_fees?.activity_fee || 0) + 
      (recurring_fees?.transport_fee || existingStudent.recurring_fees?.transport_fee || 0);
    
    const studentData = {
      name,
      date_of_birth: new Date(date_of_birth),
      gender,
      blood_group: blood_group || '',
      class_id: class_id || null,
      section: section || 'A',
      class_type: classType,
      assigned_teacher_id: assigned_teacher_id || null,
      parent_name,
      parent_relationship: parent_relationship || 'Mother',
      parent_email,
      parent_phone,
      parent_aadhar: parent_aadhar || '',
      address,
      emergency_contact: emergency_contact ? {
        name: emergency_contact.name,
        relationship: emergency_contact.relationship,
        phone: emergency_contact.phone,
      } : existingStudent.emergency_contact,
      medical_info: medical_info || '',
      enrollment_date: new Date(enrollment_date),
      admission_date: admission_date ? new Date(admission_date) : existingStudent.admission_date,
      academic_year: academic_year || existingStudent.academic_year,
      enrollment_type: enrollment_type || existingStudent.enrollment_type || 'New Admission',
      previous_class: previous_class !== undefined ? previous_class : existingStudent.previous_class || '',
      transport_type: transport_type || 'Walker',
      vehicle_id: transport_type !== 'Walker' ? vehicle_id : null,
      vendor_id: transport_type !== 'Walker' ? vendor_id : null,
      status: status || 'Active',
      documents: updatedDocuments,
      registration_fee: regFee,
      admission_fee: admFee,
      tuition_fee: tuiFee,
      activity_fee: actFee,
      kit_fee: kitFee,
      cab_fee: cabFee,
      camera_fee: camFee,
      fee_frequency: fee_frequency || existingStudent.fee_frequency || 'Monthly',
      discount: disc,
      total_amount: totalAmount,
      fee_paid: fee_paid !== undefined ? fee_paid : existingStudent.fee_paid,
      payment_date: payment_date ? new Date(payment_date) : existingStudent.payment_date,
      payment_mode: payment_mode || existingStudent.payment_mode || 'Cash',
      updated_at: Date.now(),
      recurring_fees: {
        tuition_fee: recurring_fees?.tuition_fee !== undefined ? recurring_fees.tuition_fee : existingStudent.recurring_fees?.tuition_fee || 0,
        activity_fee: recurring_fees?.activity_fee !== undefined ? recurring_fees.activity_fee : existingStudent.recurring_fees?.activity_fee || 0,
        transport_fee: recurring_fees?.transport_fee !== undefined ? recurring_fees.transport_fee : existingStudent.recurring_fees?.transport_fee || 0,
        total_monthly: recurringTotal,
        start_month: recurring_fees?.start_month || existingStudent.recurring_fees?.start_month || new Date().toISOString().slice(0, 7),
        end_month: recurring_fees?.end_month !== undefined ? recurring_fees.end_month : existingStudent.recurring_fees?.end_month || null,
        fee_plan: recurring_fees?.fee_plan || existingStudent.recurring_fees?.fee_plan || 'Monthly',
        auto_generate: recurring_fees?.auto_generate !== undefined ? recurring_fees.auto_generate : (existingStudent.recurring_fees?.auto_generate !== undefined ? existingStudent.recurring_fees.auto_generate : true),
        last_generated_month: existingStudent.recurring_fees?.last_generated_month || null,
        initial_payment: existingStudent.recurring_fees?.initial_payment || {
          amount: 0,
          paid: false,
          payment_date: null,
          payment_method: 'Cash',
          invoice_id: null,
          transaction_id: '',
        },
      },
    };
    
    // Add authorized pickup only if Walker and has data
    if (transport_type === 'Walker' && authorized_pickup) {
      const hasPickupData = authorized_pickup.name || authorized_pickup.relationship || authorized_pickup.phone;
      if (hasPickupData) {
        studentData.authorized_pickup = {
          name: authorized_pickup.name || null,
          relationship: authorized_pickup.relationship || null,
          phone: authorized_pickup.phone || null,
        };
      } else {
        studentData.authorized_pickup = null;
      }
    } else {
      studentData.authorized_pickup = null;
    }
    
    const student = await Student.findByIdAndUpdate(
      id,
      studentData,
      { new: true, runValidators: true }
    ).populate({
      path: 'assigned_teacher_id',
      model: 'Staff',
      select: 'name designation email phone role'
    });
    
    // Sync student fees to finance module
    const feeSyncResult = await syncStudentFeesToFinance(student, true);
    console.log(`💰 Fee sync result for ${student.name}: ${feeSyncResult.action}`);
    
    // Sync to mobile backend
    const syncResult = await syncStudentToMobile(student);
    
    const responseData = student.toObject();
    responseData.sync = syncResult;
    responseData.feeSync = feeSyncResult;
    
    res.json(responseData);
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== UPDATE STUDENT FEE STATUS ====================
router.patch('/:id/fee', async (req, res) => {
  try {
    const { id } = req.params;
    const { fee_paid, payment_date, payment_mode, discount, fee_frequency } = req.body;
    
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    if (fee_paid !== undefined) student.fee_paid = fee_paid;
    if (discount !== undefined) student.discount = parseFloat(discount) || 0;
    if (fee_frequency) student.fee_frequency = fee_frequency;
    
    const subtotal = 
      (student.registration_fee || 0) + 
      (student.admission_fee || 0) + 
      (student.tuition_fee || 0) + 
      (student.activity_fee || 0) + 
      (student.kit_fee || 0) + 
      (student.cab_fee || 0) + 
      (student.camera_fee || 0);
    student.total_amount = Math.max(0, subtotal - (student.discount || 0));
    
    if (fee_paid) {
      student.payment_date = payment_date ? new Date(payment_date) : new Date();
    } else {
      student.payment_date = null;
    }
    student.payment_mode = payment_mode || student.payment_mode || 'Cash';
    student.updated_at = Date.now();
    
    await student.save();
    
    try {
      const existingFee = await Fee.findOne({ student_id: student._id });
      if (existingFee) {
        await Fee.findByIdAndUpdate(existingFee._id, {
          status: fee_paid ? 'Paid' : 'Pending',
          payment_date: student.payment_date,
          payment_method: student.payment_mode,
          discount: student.discount,
          fee_frequency: student.fee_frequency,
          total_amount: student.total_amount,
          updated_at: Date.now()
        });
        console.log(`💰 Fee status updated for ${student.name} in finance module`);
      } else {
        await syncStudentFeesToFinance(student, false);
        console.log(`💰 New fee record created for ${student.name} in finance module`);
      }
    } catch (feeError) {
      console.error('Error updating fee in finance module:', feeError.message);
    }
    
    const syncResult = await syncStudentToMobile(student);
    
    const responseData = student.toObject();
    responseData.sync = syncResult;
    
    res.json(responseData);
  } catch (error) {
    console.error('Error updating fee status:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== DELETE STUDENT ====================
router.delete('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    if (student.documents) {
      if (student.documents.student_photo) {
        await deleteFromCloudinary(student.documents.student_photo);
      }
      if (student.documents.birth_certificate) {
        await deleteFromCloudinary(student.documents.birth_certificate);
      }
      if (student.documents.aadhar_card) {
        await deleteFromCloudinary(student.documents.aadhar_card);
      }
      if (student.documents.parent_aadhar_front) {
        await deleteFromCloudinary(student.documents.parent_aadhar_front);
      }
      if (student.documents.parent_aadhar_back) {
        await deleteFromCloudinary(student.documents.parent_aadhar_back);
      }
    }
    
    try {
      const feeRecord = await Fee.findOne({ student_id: student._id });
      if (feeRecord) {
        await Fee.findByIdAndDelete(feeRecord._id);
        console.log(`💰 Fee record deleted for ${student.name} from finance module`);
      }
    } catch (feeError) {
      console.error('Error deleting fee record:', feeError.message);
    }
    
    await syncStudentToMobile(student, true);
    
    await Student.findByIdAndDelete(req.params.id);
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== SYNC ALL STUDENTS TO MOBILE ====================
router.post('/sync-to-mobile', async (req, res) => {
  try {
    const students = await Student.find();
    
    console.log(`📤 Syncing ${students.length} students to mobile backend...`);
    
    const studentsForSync = students.map(student => ({
      name: student.name,
      rollNumber: student.rollNumber,
      class_id: student.class_id,
      section: student.section || 'A',
      parent_name: student.parent_name,
      parent_relationship: student.parent_relationship || 'Mother',
      parent_phone: student.parent_phone,
      parent_email: student.parent_email,
      date_of_birth: student.date_of_birth,
      gender: student.gender,
      blood_group: student.blood_group,
      address: student.address,
      status: student.status,
      registration_fee: student.registration_fee || 0,
      admission_fee: student.admission_fee || 0,
      tuition_fee: student.tuition_fee || 0,
      activity_fee: student.activity_fee || 0,
      kit_fee: student.kit_fee || 0,
      cab_fee: student.cab_fee || 0,
      camera_fee: student.camera_fee || 0,
      fee_frequency: student.fee_frequency || 'Monthly',
      discount: student.discount || 0,
      total_amount: student.total_amount || 0,
      fee_paid: student.fee_paid || false,
      payment_date: student.payment_date || null,
      payment_mode: student.payment_mode || 'Cash',
      emergency_contact: student.emergency_contact || {},
      authorized_pickup: student.authorized_pickup || null,
      documents: student.documents || {},
      admission_date: student.admission_date || null,
      academic_year: student.academic_year || '',
      enrollment_type: student.enrollment_type || 'New Admission',
      previous_class: student.previous_class || '',
      recurring_fees: student.recurring_fees || {},
    }));
    
    if (!process.env.MOBILE_BACKEND_URL) {
      return res.status(400).json({ 
        success: false, 
        message: 'MOBILE_BACKEND_URL not configured in environment variables' 
      });
    }
    
    const response = await axios.post(
      `${process.env.MOBILE_BACKEND_URL}/api/sync/students`,
      { students: studentsForSync },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Key': process.env.SYNC_SECRET_KEY
        },
        timeout: 30000
      }
    );
    
    console.log(`✅ Sync completed: ${response.data.created} created, ${response.data.updated} updated`);
    
    res.json({
      success: true,
      message: `Successfully synced ${students.length} students to mobile`,
      syncResult: response.data
    });
  } catch (error) {
    console.error('Sync to mobile error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to sync students to mobile',
      error: error.message 
    });
  }
});

// ==================== SYNC SINGLE STUDENT TO MOBILE ====================
router.post('/:id/sync-to-mobile', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    const syncResult = await syncStudentToMobile(student);
    
    res.json({
      success: true,
      message: `Student ${student.name} synced successfully`,
      syncResult: syncResult
    });
  } catch (error) {
    console.error('Sync single student error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ==================== SYNC ALL STUDENT FEES TO FINANCE ====================
router.post('/sync-fees-to-finance', async (req, res) => {
  try {
    const students = await Student.find();
    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];
    
    console.log(`💰 Syncing ${students.length} student fee records to finance module...`);
    
    for (const student of students) {
      try {
        const result = await syncStudentFeesToFinance(student, true);
        if (result.success) {
          if (result.action === 'created') created++;
          else if (result.action === 'updated') updated++;
        } else {
          failed++;
          errors.push({ student: student.name, error: result.error });
        }
      } catch (error) {
        failed++;
        errors.push({ student: student.name, error: error.message });
      }
    }
    
    console.log(`💰 Fee sync completed: ${created} created, ${updated} updated, ${failed} failed`);
    
    res.json({
      success: true,
      message: `Fee sync completed: ${created} created, ${updated} updated, ${failed} failed`,
      results: { created, updated, failed, errors }
    });
  } catch (error) {
    console.error('Error syncing fees to finance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to sync student fees to finance',
      error: error.message 
    });
  }
});

// ==================== PROMOTE ALL STUDENTS TO NEXT CLASS ====================
const CLASS_PROGRESSION = {
  'toddler': 'pre-nursery',
  'pre-nursery': 'nursery',
  'nursery': 'kg-1',
  'kg-1': null,
};

router.post('/promote-all', async (req, res) => {
  try {
    const { academic_year } = req.body;

    const students = await Student.find({ status: 'Active' });

    const results = { promoted: 0, graduated: 0, skipped: 0, details: [] };

    for (const student of students) {
      const currentClass = student.class_id;

      if (!currentClass || !(currentClass in CLASS_PROGRESSION)) {
        results.skipped++;
        continue;
      }

      const nextClass = CLASS_PROGRESSION[currentClass];
      student.promotion_history = student.promotion_history || [];

      if (nextClass === null) {
        student.status = 'Graduated';
        student.promotion_history.push({
          from_class: currentClass,
          to_class: 'Graduated',
          academic_year: academic_year || '',
          promoted_at: new Date(),
        });
        results.graduated++;
        results.details.push({ id: student._id, name: student.name, from: currentClass, to: 'Graduated' });
      } else {
        student.promotion_history.push({
          from_class: currentClass,
          to_class: nextClass,
          academic_year: academic_year || '',
          promoted_at: new Date(),
        });
        student.class_id = nextClass;
        results.promoted++;
        results.details.push({ id: student._id, name: student.name, from: currentClass, to: nextClass });
      }

      await student.save();
    }

    res.json({
      success: true,
      message: `Promotion complete: ${results.promoted} promoted, ${results.graduated} graduated, ${results.skipped} skipped`,
      results,
    });
  } catch (error) {
    console.error('Error promoting students:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;