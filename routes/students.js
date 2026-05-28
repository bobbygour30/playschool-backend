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
      // Delete student from mobile
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
      // Create/Update student in mobile
      const payload = {
        name: studentData.name,
        rollNumber: studentData.rollNumber,
        class_id: studentData.class_id,
        section: studentData.section || 'A',
        parent_name: studentData.parent_name,
        parent_phone: studentData.parent_phone,
        parent_email: studentData.parent_email,
        date_of_birth: studentData.date_of_birth,
        gender: studentData.gender,
        address: studentData.address,
        status: studentData.status,
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
    
    // Add class name to each student
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

// ==================== CREATE STUDENT ====================
router.post('/', async (req, res) => {
  try {
    const {
      name,
      date_of_birth,
      gender,
      class_id,
      section,
      assigned_teacher_id,
      parent_name,
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
    } = req.body;
    
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
    
    const studentData = {
      name,
      date_of_birth: new Date(date_of_birth),
      gender,
      class_id: class_id || null,
      section: section || 'A',
      class_type: classType,
      assigned_teacher_id: assigned_teacher_id || null,
      parent_name,
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
      class_id,
      section,
      assigned_teacher_id,
      parent_name,
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
    
    const studentData = {
      name,
      date_of_birth: new Date(date_of_birth),
      gender,
      class_id: class_id || null,
      section: section || 'A',
      class_type: classType,
      assigned_teacher_id: assigned_teacher_id || null,
      parent_name,
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
    
    // Format students for mobile sync
    const studentsForSync = students.map(student => ({
      name: student.name,
      rollNumber: student.rollNumber,
      class_id: student.class_id,
      section: student.section || 'A',
      parent_name: student.parent_name,
      parent_phone: student.parent_phone,
      parent_email: student.parent_email,
      date_of_birth: student.date_of_birth,
      gender: student.gender,
      address: student.address,
      status: student.status,
    }));
    
    // Check if mobile backend URL is configured
    if (!process.env.MOBILE_BACKEND_URL) {
      return res.status(400).json({ 
        success: false, 
        message: 'MOBILE_BACKEND_URL not configured in environment variables' 
      });
    }
    
    // Call mobile backend sync endpoint
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

module.exports = router;