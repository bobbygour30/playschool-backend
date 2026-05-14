const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty');
const bcrypt = require('bcryptjs');

// Get all faculty
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { faculty_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile_number: { $regex: search, $options: 'i' } },
        { employee_id: { $regex: search, $options: 'i' } },
      ];
    }
    
    const faculty = await Faculty.find(query).sort({ created_at: -1 });
    res.json(faculty);
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
    res.json(faculty);
  } catch (error) {
    console.error('Error fetching faculty:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create faculty
router.post('/', async (req, res) => {
  try {
    const {
      faculty_name,
      mobile_number,
      email,
      qualification,
      address,
      assigned_class,
      assigned_section,
      subject,
      employee_id,
      joining_date,
      username,
      password,
      status,
      experience_years,
      specialization,
      notes,
    } = req.body;
    
    // Check if employee_id or username already exists
    const existingFaculty = await Faculty.findOne({ 
      $or: [{ email }, { username }, { employee_id }, { mobile_number }] 
    });
    if (existingFaculty) {
      return res.status(400).json({ message: 'Faculty with this email, username, employee ID, or mobile number already exists' });
    }
    
    const faculty = new Faculty({
      faculty_name,
      mobile_number,
      email,
      qualification,
      address,
      assigned_class,
      assigned_section: assigned_section || 'A',
      subject: subject || '',
      employee_id,
      joining_date: new Date(joining_date),
      username,
      password,
      status: status || 'Active',
      experience_years: experience_years || 0,
      specialization: specialization || '',
      notes: notes || '',
    });
    
    const savedFaculty = await faculty.save();
    // Remove password from response
    const facultyResponse = savedFaculty.toObject();
    delete facultyResponse.password;
    
    res.status(201).json(facultyResponse);
  } catch (error) {
    console.error('Error creating faculty:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update faculty
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingFaculty = await Faculty.findById(id);
    
    if (!existingFaculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    
    const {
      faculty_name,
      mobile_number,
      email,
      qualification,
      address,
      assigned_class,
      assigned_section,
      subject,
      employee_id,
      joining_date,
      username,
      password,
      status,
      experience_years,
      specialization,
      notes,
    } = req.body;
    
    const updateData = {
      faculty_name,
      mobile_number,
      email,
      qualification,
      address,
      assigned_class,
      assigned_section: assigned_section || 'A',
      subject: subject || '',
      employee_id,
      joining_date: new Date(joining_date),
      username,
      status,
      experience_years: experience_years || 0,
      specialization: specialization || '',
      notes: notes || '',
      updated_at: Date.now(),
    };
    
    // Only update password if provided
    if (password && password !== existingFaculty.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }
    
    const faculty = await Faculty.findByIdAndUpdate(id, updateData, { new: true });
    const facultyResponse = faculty.toObject();
    delete facultyResponse.password;
    
    res.json(facultyResponse);
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
    console.error('Error deleting faculty:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update faculty status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const faculty = await Faculty.findByIdAndUpdate(
      id,
      { status, updated_at: Date.now() },
      { new: true }
    );
    
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    
    const facultyResponse = faculty.toObject();
    delete facultyResponse.password;
    res.json(facultyResponse);
  } catch (error) {
    console.error('Error updating faculty status:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get faculty statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalFaculty = await Faculty.countDocuments();
    const activeFaculty = await Faculty.countDocuments({ status: 'Active' });
    const inactiveFaculty = await Faculty.countDocuments({ status: 'Inactive' });
    const onLeaveFaculty = await Faculty.countDocuments({ status: 'On Leave' });
    
    res.json({
      total: totalFaculty,
      active: activeFaculty,
      inactive: inactiveFaculty,
      onLeave: onLeaveFaculty,
    });
  } catch (error) {
    console.error('Error fetching faculty stats:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;