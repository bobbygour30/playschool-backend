const express = require('express');
const router = express.Router();
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const bcrypt = require('bcryptjs');
const syncToMobileBackend = require('../utils/syncParentToMobile');

// Get all parents
router.get('/', async (req, res) => {
  try {
    const { status, search, sync_status } = req.query;
    let query = {};
    
    if (status && status !== 'all') query.status = status;
    if (sync_status && sync_status !== 'all') query.sync_status = sync_status;
    
    if (search) {
      query.$or = [
        { parent_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile_number: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }
    
    const parents = await Parent.find(query)
      .populate('student_ids', 'name class_id section rollNumber')
      .sort({ created_at: -1 });
    
    res.json(parents);
  } catch (error) {
    console.error('Error fetching parents:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get parent by ID
router.get('/:id', async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id)
      .populate('student_ids', 'name class_id section rollNumber dob');
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    res.json(parent);
  } catch (error) {
    console.error('Error fetching parent:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get parent's students
router.get('/:id/students', async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id)
      .populate('student_ids');
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    res.json(parent.student_ids);
  } catch (error) {
    console.error('Error fetching parent students:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create parent with auto-sync
router.post('/', async (req, res) => {
  try {
    const {
      parent_name,
      parent_role,
      mobile_number,
      email,
      address,
      student_ids,
      emergency_contact,
      username,
      password,
      status,
      notes,
    } = req.body;
    
    // Check if already exists
    const existingParent = await Parent.findOne({ 
      $or: [{ email }, { username }, { mobile_number }] 
    });
    if (existingParent) {
      return res.status(400).json({ message: 'Parent with this email, username, or mobile number already exists' });
    }
    
    const parent = new Parent({
      parent_name,
      parent_role,
      mobile_number,
      email,
      address,
      student_ids: student_ids || [],
      emergency_contact,
      username,
      password,
      status: status || 'Active',
      notes: notes || '',
      sync_status: 'pending',
    });
    
    const savedParent = await parent.save();
    await savedParent.populate('student_ids', 'name class_id section rollNumber');
    
    // Auto-sync to mobile backend
    let syncResult = null;
    if (process.env.MOBILE_BACKEND_URL) {
      syncResult = await syncToMobileBackend(savedParent);
      if (syncResult.success) {
        savedParent.sync_status = 'synced';
        savedParent.synced_at = new Date();
        await savedParent.save();
      } else {
        savedParent.sync_status = 'failed';
        savedParent.sync_error = syncResult.error;
        savedParent.sync_attempts = 1;
        await savedParent.save();
      }
    }
    
    const parentResponse = savedParent.toObject();
    delete parentResponse.password;
    
    res.status(201).json({
      ...parentResponse,
      sync: syncResult || { message: 'Sync not configured' }
    });
  } catch (error) {
    console.error('Error creating parent:', error);
    res.status(400).json({ message: error.message });
  }
});

// Link student to parent
router.post('/:id/link-student', async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId } = req.body;
    
    const parent = await Parent.findById(id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    if (!parent.student_ids.includes(studentId)) {
      parent.student_ids.push(studentId);
      parent.sync_status = 'pending';
      await parent.save();
    }
    
    await parent.populate('student_ids', 'name class_id section rollNumber');
    
    // Auto-sync to mobile
    let syncResult = null;
    if (process.env.MOBILE_BACKEND_URL) {
      syncResult = await syncToMobileBackend(parent);
      if (syncResult.success) {
        parent.sync_status = 'synced';
        parent.synced_at = new Date();
        await parent.save();
      } else {
        parent.sync_status = 'failed';
        parent.sync_error = syncResult.error;
        await parent.save();
      }
    }
    
    res.json({ 
      success: true, 
      parent,
      sync: syncResult || { message: 'Sync not configured' }
    });
  } catch (error) {
    console.error('Error linking student:', error);
    res.status(500).json({ message: error.message });
  }
});

// Unlink student from parent
router.delete('/:id/link-student/:studentId', async (req, res) => {
  try {
    const { id, studentId } = req.params;
    
    const parent = await Parent.findById(id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    parent.student_ids = parent.student_ids.filter(
      sId => sId.toString() !== studentId
    );
    parent.sync_status = 'pending';
    await parent.save();
    
    await parent.populate('student_ids', 'name class_id section rollNumber');
    
    // Auto-sync to mobile
    let syncResult = null;
    if (process.env.MOBILE_BACKEND_URL) {
      syncResult = await syncToMobileBackend(parent);
      if (syncResult.success) {
        parent.sync_status = 'synced';
        parent.synced_at = new Date();
        await parent.save();
      } else {
        parent.sync_status = 'failed';
        parent.sync_error = syncResult.error;
        await parent.save();
      }
    }
    
    res.json({ 
      success: true, 
      parent,
      sync: syncResult || { message: 'Sync not configured' }
    });
  } catch (error) {
    console.error('Error unlinking student:', error);
    res.status(500).json({ message: error.message });
  }
});

// Force re-sync
router.post('/:id/force-resync', async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id)
      .populate('student_ids', 'name class_id section rollNumber');
    
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    const syncResult = await syncToMobileBackend(parent);
    
    if (syncResult.success) {
      parent.sync_status = 'synced';
      parent.synced_at = new Date();
      parent.sync_error = null;
      await parent.save();
      
      res.json({ 
        success: true,
        message: 'Force sync successful', 
        sync: syncResult 
      });
    } else {
      parent.sync_status = 'failed';
      parent.sync_error = syncResult.error;
      parent.sync_attempts += 1;
      await parent.save();
      
      res.status(500).json({ 
        success: false,
        message: 'Force sync failed', 
        error: syncResult.error 
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bulk sync
router.post('/bulk-sync', async (req, res) => {
  try {
    const pendingParents = await Parent.find({ 
      sync_status: { $in: ['pending', 'failed'] } 
    }).populate('student_ids', 'name class_id section rollNumber');
    
    const results = { total: pendingParents.length, success: [], failed: [] };
    
    for (const parent of pendingParents) {
      const syncResult = await syncToMobileBackend(parent);
      
      if (syncResult.success) {
        parent.sync_status = 'synced';
        parent.synced_at = new Date();
        parent.sync_error = null;
        results.success.push(parent.email);
      } else {
        parent.sync_status = 'failed';
        parent.sync_error = syncResult.error;
        parent.sync_attempts += 1;
        results.failed.push({ email: parent.email, error: syncResult.error });
      }
      await parent.save();
    }
    
    res.json({ message: 'Bulk sync completed', results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Sync status
router.get('/sync/status', async (req, res) => {
  try {
    const total = await Parent.countDocuments();
    const synced = await Parent.countDocuments({ sync_status: 'synced' });
    const pending = await Parent.countDocuments({ sync_status: 'pending' });
    const failed = await Parent.countDocuments({ sync_status: 'failed' });
    
    const lastSync = await Parent.findOne({ synced_at: { $ne: null } })
      .sort({ synced_at: -1 })
      .select('synced_at');
    
    res.json({
      total,
      synced,
      pending,
      failed,
      lastSyncAt: lastSync?.synced_at || null,
      syncEnabled: !!process.env.MOBILE_BACKEND_URL,
      mobileBackendUrl: process.env.MOBILE_BACKEND_URL || 'Not configured',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
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
      student_ids,
      emergency_contact,
      username,
      password,
      status,
      notes,
    } = req.body;
    
    // Check if email/username/mobile already exists for other users
    const duplicateCheck = await Parent.findOne({
      _id: { $ne: id },
      $or: [{ email }, { username }, { mobile_number }]
    });
    
    if (duplicateCheck) {
      return res.status(400).json({ 
        message: 'Email, username, or mobile number already exists for another parent' 
      });
    }
    
    const updateData = {
      parent_name,
      parent_role: parent_role || 'Father',
      mobile_number,
      email,
      address,
      student_ids: student_ids || [],
      emergency_contact,
      username,
      status: status || 'Active',
      notes: notes || '',
      updated_at: Date.now(),
      sync_status: 'pending',
    };
    
    // Only update password if provided
    if (password && password !== existingParent.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }
    
    const parent = await Parent.findByIdAndUpdate(id, updateData, { new: true });
    await parent.populate('student_ids', 'name class_id section rollNumber');
    
    // Optional sync
    let syncResult = null;
    try {
      if (process.env.MOBILE_BACKEND_URL && process.env.MOBILE_SYNC_ENABLED !== 'false') {
        syncResult = await syncToMobileBackend(parent);
        if (syncResult && syncResult.success) {
          parent.sync_status = 'synced';
          parent.synced_at = new Date();
          parent.sync_error = null;
          await parent.save();
        } else if (syncResult && syncResult.skipped) {
          // Sync was skipped
          console.log(`Sync skipped for ${parent.email}`);
        } else {
          parent.sync_status = 'failed';
          parent.sync_error = syncResult?.error || 'Unknown error';
          await parent.save();
        }
      }
    } catch (syncError) {
      console.warn(`Sync warning:`, syncError.message);
    }
    
    const parentResponse = parent.toObject();
    delete parentResponse.password;
    
    res.json({
      ...parentResponse,
      sync: syncResult || { message: 'Sync not configured' }
    });
  } catch (error) {
    console.error('Error updating parent:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== DELETE PARENT (ADD THIS) ====================
// Delete parent
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const parent = await Parent.findById(id);
    
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    // Notify mobile backend about deletion
    if (process.env.MOBILE_BACKEND_URL && process.env.MOBILE_SYNC_ENABLED !== 'false') {
      try {
        const axios = require('axios');
        await axios.delete(`${process.env.MOBILE_BACKEND_URL}/api/sync/parent/${parent._id}`, {
          headers: { 'X-Sync-Key': process.env.SYNC_SECRET_KEY }
        });
        console.log(`Parent ${parent.email} deleted from mobile`);
      } catch (syncError) {
        console.warn(`Failed to notify mobile about deletion:`, syncError.message);
      }
    }
    
    await Parent.findByIdAndDelete(id);
    
    res.json({ 
      success: true,
      message: 'Parent deleted successfully',
      deletedEmail: parent.email
    });
  } catch (error) {
    console.error('Error deleting parent:', error);
    res.status(500).json({ message: error.message });
  }
});
module.exports = router;