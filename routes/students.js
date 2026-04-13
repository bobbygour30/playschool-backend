const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const { STANDARD_CLASSES } = require('../utils/classHelper');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// Get all students with populated references
router.get('/', async (req, res) => {
  try {
    const students = await Student.find()
      .populate('assigned_teacher_id', 'name designation email phone')
      .populate('assigned_staff_id', 'name designation email phone')
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

// Get students by class
router.get('/class/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const students = await Student.find({ class_id: classId })
      .populate('assigned_teacher_id', 'name designation')
      .populate('assigned_staff_id', 'name designation');
    
    res.json(students);
  } catch (error) {
    console.error('Error fetching students by class:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get student by ID
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('assigned_teacher_id', 'name designation email phone')
      .populate('assigned_staff_id', 'name designation email phone');
    
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

// Get students by teacher
router.get('/teacher/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const students = await Student.find({ assigned_teacher_id: teacherId })
      .populate('assigned_staff_id', 'name');
    
    res.json(students);
  } catch (error) {
    console.error('Error fetching students by teacher:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get class-wise statistics
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

// Create student with document upload to Cloudinary
router.post('/', async (req, res) => {
  try {
    const {
      name,
      date_of_birth,
      gender,
      class_id,
      assigned_teacher_id,
      assigned_staff_id,
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
      class_type: classType,
      assigned_teacher_id: assigned_teacher_id || null,
      assigned_staff_id: assigned_staff_id || null,
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
    
    const populatedStudent = await Student.findById(savedStudent._id)
      .populate('assigned_teacher_id', 'name designation')
      .populate('assigned_staff_id', 'name designation');
    
    res.status(201).json(populatedStudent);
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update student with document management
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
      assigned_teacher_id,
      assigned_staff_id,
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
    
    // Handle document updates - delete old files from Cloudinary if replaced
    const updatedDocuments = { ...existingStudent.documents };
    
    if (documents) {
      // Birth Certificate
      if (documents.birth_certificate && documents.birth_certificate !== existingStudent.documents?.birth_certificate) {
        if (existingStudent.documents?.birth_certificate) {
          await deleteFromCloudinary(existingStudent.documents.birth_certificate);
        }
        updatedDocuments.birth_certificate = await uploadToCloudinary(
          documents.birth_certificate,
          'students/birth_certificates'
        );
      }
      
      // Aadhar Card
      if (documents.aadhar_card && documents.aadhar_card !== existingStudent.documents?.aadhar_card) {
        if (existingStudent.documents?.aadhar_card) {
          await deleteFromCloudinary(existingStudent.documents.aadhar_card);
        }
        updatedDocuments.aadhar_card = await uploadToCloudinary(
          documents.aadhar_card,
          'students/aadhar_cards'
        );
      }
      
      // Parent Aadhar Front
      if (documents.parent_aadhar_front && documents.parent_aadhar_front !== existingStudent.documents?.parent_aadhar_front) {
        if (existingStudent.documents?.parent_aadhar_front) {
          await deleteFromCloudinary(existingStudent.documents.parent_aadhar_front);
        }
        updatedDocuments.parent_aadhar_front = await uploadToCloudinary(
          documents.parent_aadhar_front,
          'students/parent_aadhar'
        );
      }
      
      // Parent Aadhar Back
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
      class_type: classType,
      assigned_teacher_id: assigned_teacher_id || null,
      assigned_staff_id: assigned_staff_id || null,
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
    ).populate('assigned_teacher_id', 'name designation')
     .populate('assigned_staff_id', 'name designation');
    
    res.json(student);
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete student and associated documents
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
    
    await Student.findByIdAndDelete(req.params.id);
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;