const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty');
const { STANDARD_CLASSES } = require('../utils/classHelper');

// Get all faculty
router.get('/', async (req, res) => {
  try {
    const faculty = await Faculty.find()
      .sort({ created_at: -1 });
    
    // Add class name to each faculty member
    const facultyWithClass = faculty.map(member => {
      const memberObj = member.toObject();
      if (member.class_type === 'standard' && STANDARD_CLASSES[member.class_id]) {
        memberObj.class_name = STANDARD_CLASSES[member.class_id];
      } else {
        memberObj.class_name = member.class_id || 'N/A';
      }
      return memberObj;
    });
    
    res.json(facultyWithClass);
  } catch (error) {
    console.error('Error fetching faculty:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get faculty by ID
router.get('/:id', async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id);
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    
    const facultyObj = faculty.toObject();
    if (faculty.class_type === 'standard' && STANDARD_CLASSES[faculty.class_id]) {
      facultyObj.class_name = STANDARD_CLASSES[faculty.class_id];
    } else {
      facultyObj.class_name = faculty.class_id || 'N/A';
    }
    
    res.json(facultyObj);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create faculty
router.post('/', async (req, res) => {
  try {
    const { class_id, ...otherData } = req.body;
    
    // Determine if it's a standard class or custom class
    let classType = 'custom';
    if (class_id && STANDARD_CLASSES[class_id]) {
      classType = 'standard';
    }
    
    const facultyData = {
      ...otherData,
      class_id: class_id || null,
      class_type: classType,
    };
    
    const faculty = new Faculty(facultyData);
    const savedFaculty = await faculty.save();
    res.status(201).json(savedFaculty);
  } catch (error) {
    console.error('Error creating faculty:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update faculty
router.put('/:id', async (req, res) => {
  try {
    const { class_id, ...otherData } = req.body;
    
    // Determine if it's a standard class or custom class
    let classType = 'custom';
    if (class_id && STANDARD_CLASSES[class_id]) {
      classType = 'standard';
    }
    
    const facultyData = {
      ...otherData,
      class_id: class_id || null,
      class_type: classType,
    };
    
    const faculty = await Faculty.findByIdAndUpdate(
      req.params.id,
      facultyData,
      { new: true, runValidators: true }
    );
    
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    
    res.json(faculty);
  } catch (error) {
    console.error('Error updating faculty:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete faculty
router.delete('/:id', async (req, res) => {
  try {
    const faculty = await Faculty.findByIdAndDelete(req.params.id);
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    res.json({ message: 'Faculty deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;