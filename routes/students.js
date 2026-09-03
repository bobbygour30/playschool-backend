// routes/students.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
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
        total_amount: studentData.total_amount || 0,
        fee_paid: studentData.fee_paid || false,
        payment_date: studentData.payment_date || null,
        payment_mode: studentData.payment_mode || 'Cash',
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
      total_amount: student.total_amount || 0,
      fee_paid: student.fee_paid,
      payment_date: student.payment_date,
      payment_mode: student.payment_mode
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
      transport_type,
      vehicle_id,
      status,
      documents,
      registration_fee,
      admission_fee,
      tuition_fee,
      activity_fee,
      kit_fee,
      cab_fee,
      camera_fee,
      fee_paid,
      payment_date,
      payment_mode,
    } = req.body;
    
    // Validate mandatory documents
    if (!documents?.birth_certificate) {
      return res.status(400).json({ message: 'Birth Certificate is mandatory' });
    }
    if (!documents?.parent_aadhar_front) {
      return res.status(400).json({ message: 'Parent Aadhar (Front) is mandatory' });
    }
    if (!documents?.parent_aadhar_back) {
      return res.status(400).json({ message: 'Parent Aadhar (Back) is mandatory' });
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
    
    // Calculate total amount from all fee components
    const regFee = parseFloat(registration_fee) || 0;
    const admFee = parseFloat(admission_fee) || 0;
    const tuiFee = parseFloat(tuition_fee) || 0;
    const actFee = parseFloat(activity_fee) || 0;
    const kitFee = parseFloat(kit_fee) || 0;
    const cabFee = parseFloat(cab_fee) || 0;
    const camFee = parseFloat(camera_fee) || 0;
    const totalAmount = regFee + admFee + tuiFee + actFee + kitFee + cabFee + camFee;
    
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
      emergency_contact,
      medical_info: medical_info || '',
      enrollment_date: new Date(enrollment_date),
      transport_type: transport_type || 'Walker',
      vehicle_id: transport_type === 'Cab' ? vehicle_id : null,
      status: status || 'Active',
      documents: uploadedDocuments,
      registration_fee: regFee,
      admission_fee: admFee,
      tuition_fee: tuiFee,
      activity_fee: actFee,
      kit_fee: kitFee,
      cab_fee: cabFee,
      camera_fee: camFee,
      total_amount: totalAmount,
      fee_paid: fee_paid || false,
      payment_date: payment_date ? new Date(payment_date) : null,
      payment_mode: payment_mode || 'Cash',
    };
    
    const student = new Student(studentData);
    const savedStudent = await student.save();
    
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
      transport_type,
      vehicle_id,
      status,
      documents,
      registration_fee,
      admission_fee,
      tuition_fee,
      activity_fee,
      kit_fee,
      cab_fee,
      camera_fee,
      fee_paid,
      payment_date,
      payment_mode,
    } = req.body;
    
    // Verify teacher exists if provided
    if (assigned_teacher_id) {
      const teacherExists = await Staff.findById(assigned_teacher_id);
      if (!teacherExists) {
        return res.status(400).json({ message: 'Selected teacher does not exist' });
      }
    }
    
    // Handle document updates
    const updatedDocuments = { ...existingStudent.documents };
    
    if (documents) {
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
    
    // Calculate total amount from all fee components
    const regFee = parseFloat(registration_fee) !== undefined ? parseFloat(registration_fee) : existingStudent.registration_fee || 0;
    const admFee = parseFloat(admission_fee) !== undefined ? parseFloat(admission_fee) : existingStudent.admission_fee || 0;
    const tuiFee = parseFloat(tuition_fee) !== undefined ? parseFloat(tuition_fee) : existingStudent.tuition_fee || 0;
    const actFee = parseFloat(activity_fee) !== undefined ? parseFloat(activity_fee) : existingStudent.activity_fee || 0;
    const kitFee = parseFloat(kit_fee) !== undefined ? parseFloat(kit_fee) : existingStudent.kit_fee || 0;
    const cabFee = parseFloat(cab_fee) !== undefined ? parseFloat(cab_fee) : existingStudent.cab_fee || 0;
    const camFee = parseFloat(camera_fee) !== undefined ? parseFloat(camera_fee) : existingStudent.camera_fee || 0;
    const totalAmount = regFee + admFee + tuiFee + actFee + kitFee + cabFee + camFee;
    
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
      emergency_contact,
      medical_info: medical_info || '',
      enrollment_date: new Date(enrollment_date),
      transport_type: transport_type || 'Walker',
      vehicle_id: transport_type === 'Cab' ? vehicle_id : null,
      status: status || 'Active',
      documents: updatedDocuments,
      registration_fee: regFee,
      admission_fee: admFee,
      tuition_fee: tuiFee,
      activity_fee: actFee,
      kit_fee: kitFee,
      cab_fee: cabFee,
      camera_fee: camFee,
      total_amount: totalAmount,
      fee_paid: fee_paid !== undefined ? fee_paid : existingStudent.fee_paid,
      payment_date: payment_date ? new Date(payment_date) : existingStudent.payment_date,
      payment_mode: payment_mode || existingStudent.payment_mode || 'Cash',
      updated_at: Date.now(),
    };
    
    const student = await Student.findByIdAndUpdate(
      id,
      studentData,
      { new: true, runValidators: true }
    ).populate({
      path: 'assigned_teacher_id',
      model: 'Staff',
      select: 'name designation email phone role'
    });
    
    // Sync to mobile backend
    const syncResult = await syncStudentToMobile(student);
    
    const responseData = student.toObject();
    responseData.sync = syncResult;
    
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
    const { fee_paid, payment_date, payment_mode } = req.body;
    
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    student.fee_paid = fee_paid !== undefined ? fee_paid : student.fee_paid;
    if (fee_paid) {
      student.payment_date = payment_date ? new Date(payment_date) : new Date();
    } else {
      student.payment_date = null;
    }
    student.payment_mode = payment_mode || student.payment_mode || 'Cash';
    student.updated_at = Date.now();
    
    await student.save();
    
    // Sync to mobile backend
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
    
    // Delete all associated documents from Cloudinary
    if (student.documents) {
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
    
    // Sync deletion to mobile backend
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
      total_amount: student.total_amount || 0,
      fee_paid: student.fee_paid || false,
      payment_date: student.payment_date || null,
      payment_mode: student.payment_mode || 'Cash',
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

// ==================== PROMOTE ALL STUDENTS TO NEXT CLASS ====================
// Class progression ladder for this school. KG-1 is the terminal class —
// students there move to status "Graduated" instead of a new class_id.
const CLASS_PROGRESSION = {
  'toddler': 'pre-nursery',
  'pre-nursery': 'nursery',
  'nursery': 'kg-1',
  'kg-1': null, // null = graduates, doesn't move to another class
};

router.post('/promote-all', async (req, res) => {
  try {
    const { academic_year } = req.body;

    // Only currently Active students are eligible — Inactive/Graduated
    // students are left untouched.
    const students = await Student.find({ status: 'Active' });

    const results = { promoted: 0, graduated: 0, skipped: 0, details: [] };

    for (const student of students) {
      const currentClass = student.class_id;

      // Students with no class or a non-standard/custom class_id can't be
      // auto-promoted — skip them so an admin can handle them manually.
      if (!currentClass || !(currentClass in CLASS_PROGRESSION)) {
        results.skipped++;
        continue;
      }

      const nextClass = CLASS_PROGRESSION[currentClass];
      student.promotion_history = student.promotion_history || [];

      if (nextClass === null) {
        // Top of the ladder — graduate the student
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