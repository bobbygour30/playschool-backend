const express = require('express');
const router = express.Router();
const Class = require('../models/Class');
const { STANDARD_CLASSES } = require('../utils/classHelper');

// Get all classes (including standard and custom)
router.get('/', async (req, res) => {
  try {
    // Get custom classes from database
    const customClasses = await Class.find().sort({ name: 1 });
    
    // Convert standard classes to the format expected by frontend
    const standardClassesList = Object.entries(STANDARD_CLASSES).map(([id, name]) => ({
      _id: id,
      name: name,
      type: 'standard'
    }));
    
    // Combine both lists
    const allClasses = [...standardClassesList, ...customClasses];
    
    res.json(allClasses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get class by ID
router.get('/:id', async (req, res) => {
  try {
    // Check if it's a standard class
    if (STANDARD_CLASSES[req.params.id]) {
      return res.json({
        _id: req.params.id,
        name: STANDARD_CLASSES[req.params.id],
        type: 'standard'
      });
    }
    
    // Check custom classes
    const classData = await Class.findById(req.params.id);
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    res.json({
      ...classData.toObject(),
      type: 'custom'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create custom class
router.post('/', async (req, res) => {
  try {
    const classData = new Class(req.body);
    const savedClass = await classData.save();
    res.status(201).json({
      ...savedClass.toObject(),
      type: 'custom'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update custom class
router.put('/:id', async (req, res) => {
  try {
    // Don't allow updating standard classes
    if (STANDARD_CLASSES[req.params.id]) {
      return res.status(400).json({ message: 'Cannot modify standard classes' });
    }
    
    const classData = await Class.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    res.json({
      ...classData.toObject(),
      type: 'custom'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete custom class
router.delete('/:id', async (req, res) => {
  try {
    // Don't allow deleting standard classes
    if (STANDARD_CLASSES[req.params.id]) {
      return res.status(400).json({ message: 'Cannot delete standard classes' });
    }
    
    // Check if any students are assigned to this class
    const Student = require('../models/Student');
    const studentsCount = await Student.countDocuments({ class_id: req.params.id, class_type: 'custom' });
    
    if (studentsCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete class. ${studentsCount} student(s) are currently assigned to it.` 
      });
    }
    
    // Check if any faculty are assigned to this class
    const Faculty = require('../models/Faculty');
    const facultyCount = await Faculty.countDocuments({ class_id: req.params.id });
    
    if (facultyCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete class. ${facultyCount} faculty member(s) are currently assigned to it.` 
      });
    }
    
    const classData = await Class.findByIdAndDelete(req.params.id);
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;