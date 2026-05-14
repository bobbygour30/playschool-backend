const express = require('express');
const router = express.Router();
const Parent = require('../models/Parent');
const bcrypt = require('bcryptjs');

// Get all parents
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { parent_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile_number: { $regex: search, $options: 'i' } },
        { student_name: { $regex: search, $options: 'i' } },
      ];
    }
    
    const parents = await Parent.find(query).sort({ created_at: -1 });
    res.json(parents);
  } catch (error) {
    console.error('Error fetching parents:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get parent by ID
router.get('/:id', async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    res.json(parent);
  } catch (error) {
    console.error('Error fetching parent:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create parent
router.post('/', async (req, res) => {
  try {
    const {
      parent_name,
      parent_role,
      mobile_number,
      email,
      address,
      student_name,
      student_dob,
      class_grade,
      emergency_contact,
      username,
      password,
      status,
      notes,
    } = req.body;
    
    // Check if username already exists
    const existingParent = await Parent.findOne({ $or: [{ email }, { username }, { mobile_number }] });
    if (existingParent) {
      return res.status(400).json({ message: 'Parent with this email, username, or mobile number already exists' });
    }
    
    const parent = new Parent({
      parent_name,
      parent_role,
      mobile_number,
      email,
      address,
      student_name,
      student_dob: new Date(student_dob),
      class_grade,
      emergency_contact,
      username,
      password,
      status: status || 'Active',
      notes: notes || '',
    });
    
    const savedParent = await parent.save();
    // Remove password from response
    const parentResponse = savedParent.toObject();
    delete parentResponse.password;
    
    res.status(201).json(parentResponse);
  } catch (error) {
    console.error('Error creating parent:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update parent
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingParent = await Parent.findById(id);
    
    if (!existingParent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    const {
      parent_name,
      parent_role,
      mobile_number,
      email,
      address,
      student_name,
      student_dob,
      class_grade,
      emergency_contact,
      username,
      password,
      status,
      notes,
    } = req.body;
    
    const updateData = {
      parent_name,
      parent_role,
      mobile_number,
      email,
      address,
      student_name,
      student_dob: new Date(student_dob),
      class_grade,
      emergency_contact,
      username,
      status,
      notes: notes || '',
      updated_at: Date.now(),
    };
    
    // Only update password if provided
    if (password && password !== existingParent.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }
    
    const parent = await Parent.findByIdAndUpdate(id, updateData, { new: true });
    const parentResponse = parent.toObject();
    delete parentResponse.password;
    
    res.json(parentResponse);
  } catch (error) {
    console.error('Error updating parent:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete parent
router.delete('/:id', async (req, res) => {
  try {
    const parent = await Parent.findByIdAndDelete(req.params.id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    res.json({ message: 'Parent deleted successfully' });
  } catch (error) {
    console.error('Error deleting parent:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update parent status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const parent = await Parent.findByIdAndUpdate(
      id,
      { status, updated_at: Date.now() },
      { new: true }
    );
    
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    const parentResponse = parent.toObject();
    delete parentResponse.password;
    res.json(parentResponse);
  } catch (error) {
    console.error('Error updating parent status:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get parents statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalParents = await Parent.countDocuments();
    const activeParents = await Parent.countDocuments({ status: 'Active' });
    const inactiveParents = await Parent.countDocuments({ status: 'Inactive' });
    const suspendedParents = await Parent.countDocuments({ status: 'Suspended' });
    
    res.json({
      total: totalParents,
      active: activeParents,
      inactive: inactiveParents,
      suspended: suspendedParents,
    });
  } catch (error) {
    console.error('Error fetching parent stats:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;