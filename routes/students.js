const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Vehicle = require('../models/Vehicle');
const { STANDARD_CLASSES, isValidClassId } = require('../utils/classHelper');

// Get all students
router.get('/', async (req, res) => {
  try {
    const students = await Student.find()
      .populate('vehicle_id', 'vehicle_number route')
      .sort({ created_at: -1 });
    
    // Add class name to each student for frontend
    const studentsWithClass = students.map(student => {
      const studentObj = student.toObject();
      if (student.class_type === 'standard' && STANDARD_CLASSES[student.class_id]) {
        studentObj.class_name = STANDARD_CLASSES[student.class_id];
      } else {
        studentObj.class_name = student.class_id || 'N/A';
      }
      return studentObj;
    });
    
    res.json(studentsWithClass);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get student by ID
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('vehicle_id', 'vehicle_number route');
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    const studentObj = student.toObject();
    if (student.class_type === 'standard' && STANDARD_CLASSES[student.class_id]) {
      studentObj.class_name = STANDARD_CLASSES[student.class_id];
    } else {
      studentObj.class_name = student.class_id || 'N/A';
    }
    
    res.json(studentObj);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create student
router.post('/', async (req, res) => {
  try {
    const { class_id, ...otherData } = req.body;
    
    // Determine if it's a standard class or custom class
    let classType = 'custom';
    if (class_id && STANDARD_CLASSES[class_id]) {
      classType = 'standard';
    }
    
    const studentData = {
      ...otherData,
      class_id: class_id || null,
      class_type: classType,
    };
    
    const student = new Student(studentData);
    const savedStudent = await student.save();
    
    const populatedStudent = await Student.findById(savedStudent._id)
      .populate('vehicle_id', 'vehicle_number route');
    
    res.status(201).json(populatedStudent);
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update student
router.put('/:id', async (req, res) => {
  try {
    const { class_id, ...otherData } = req.body;
    
    // Determine if it's a standard class or custom class
    let classType = 'custom';
    if (class_id && STANDARD_CLASSES[class_id]) {
      classType = 'standard';
    }
    
    const studentData = {
      ...otherData,
      class_id: class_id || null,
      class_type: classType,
    };
    
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      studentData,
      { new: true, runValidators: true }
    ).populate('vehicle_id', 'vehicle_number route');
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    res.json(student);
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete student
router.delete('/:id', async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;