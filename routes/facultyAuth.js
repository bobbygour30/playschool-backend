const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty');
const bcrypt = require('bcryptjs');
const syncToMobileBackend = require('../utils/syncToMobile');

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

// Create faculty (UPDATED with auto-sync)
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
      sync_status: 'pending', // New faculty starts as pending sync
    });
    
    const savedFaculty = await faculty.save();
    
    // Auto-sync to mobile backend
    let syncResult = null;
    if (process.env.MOBILE_BACKEND_URL) {
      syncResult = await syncToMobileBackend(savedFaculty);
      if (syncResult.success) {
        savedFaculty.sync_status = 'synced';
        savedFaculty.synced_at = new Date();
        await savedFaculty.save();
      } else {
        savedFaculty.sync_status = 'failed';
        savedFaculty.sync_error = syncResult.error;
        savedFaculty.sync_attempts = 1;
        await savedFaculty.save();
      }
    }
    
    // Remove password from response
    const facultyResponse = savedFaculty.toObject();
    delete facultyResponse.password;
    
    res.status(201).json({
      ...facultyResponse,
      sync: syncResult || { message: 'Sync not configured' }
    });
  } catch (error) {
    console.error('Error creating faculty:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update faculty (UPDATED with re-sync)
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
      sync_status: 'pending', // Mark for re-sync
    };
    
    // Only update password if provided
    if (password && password !== existingFaculty.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }
    
    const faculty = await Faculty.findByIdAndUpdate(id, updateData, { new: true });
    
    // Re-sync to mobile backend
    let syncResult = null;
    if (process.env.MOBILE_BACKEND_URL) {
      syncResult = await syncToMobileBackend(faculty);
      if (syncResult.success) {
        faculty.sync_status = 'synced';
        faculty.synced_at = new Date();
        faculty.sync_error = null;
        await faculty.save();
      } else {
        faculty.sync_status = 'failed';
        faculty.sync_error = syncResult.error;
        faculty.sync_attempts += 1;
        await faculty.save();
      }
    }
    
    const facultyResponse = faculty.toObject();
    delete facultyResponse.password;
    
    res.json({
      ...facultyResponse,
      sync: syncResult || { message: 'Sync not configured' }
    });
  } catch (error) {
    console.error('Error updating faculty:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete faculty (UPDATED)
router.delete('/:id', async (req, res) => {
  try {
    const faculty = await Faculty.findByIdAndDelete(req.params.id);
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    
    // Optionally notify mobile backend about deletion
    if (process.env.MOBILE_BACKEND_URL) {
      try {
        await axios.delete(`${process.env.MOBILE_BACKEND_URL}/api/sync/faculty/${faculty._id}`, {
          headers: { 'X-Sync-Key': process.env.SYNC_SECRET_KEY }
        });
      } catch (syncError) {
        console.error('Failed to notify mobile about deletion:', syncError.message);
      }
    }
    
    res.json({ message: 'Faculty deleted successfully' });
  } catch (error) {
    console.error('Error deleting faculty:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update faculty status (UPDATED with re-sync)
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const faculty = await Faculty.findByIdAndUpdate(
      id,
      { 
        status, 
        updated_at: Date.now(),
        sync_status: 'pending' 
      },
      { new: true }
    );
    
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    
    // Re-sync to mobile backend
    let syncResult = null;
    if (process.env.MOBILE_BACKEND_URL) {
      syncResult = await syncToMobileBackend(faculty);
      if (syncResult.success) {
        faculty.sync_status = 'synced';
        faculty.synced_at = new Date();
        await faculty.save();
      } else {
        faculty.sync_status = 'failed';
        faculty.sync_error = syncResult.error;
        await faculty.save();
      }
    }
    
    const facultyResponse = faculty.toObject();
    delete facultyResponse.password;
    
    res.json({
      ...facultyResponse,
      sync: syncResult || { message: 'Sync not configured' }
    });
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
    const pendingSync = await Faculty.countDocuments({ sync_status: 'pending' });
    const failedSync = await Faculty.countDocuments({ sync_status: 'failed' });
    
    res.json({
      total: totalFaculty,
      active: activeFaculty,
      inactive: inactiveFaculty,
      onLeave: onLeaveFaculty,
      sync: {
        pending: pendingSync,
        failed: failedSync,
        synced: totalFaculty - pendingSync - failedSync,
      }
    });
  } catch (error) {
    console.error('Error fetching faculty stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// NEW: Retry failed sync for a specific faculty
router.post('/:id/retry-sync', async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id);
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    
    const syncResult = await syncToMobileBackend(faculty);
    
    if (syncResult.success) {
      faculty.sync_status = 'synced';
      faculty.synced_at = new Date();
      faculty.sync_error = null;
      await faculty.save();
      
      res.json({ 
        message: 'Sync retry successful', 
        sync: syncResult 
      });
    } else {
      faculty.sync_status = 'failed';
      faculty.sync_error = syncResult.error;
      faculty.sync_attempts += 1;
      await faculty.save();
      
      res.status(500).json({ 
        message: 'Sync retry failed', 
        error: syncResult.error 
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// NEW: Bulk sync all pending/failed faculty
router.post('/bulk-sync', async (req, res) => {
  try {
    const pendingFaculty = await Faculty.find({ 
      sync_status: { $in: ['pending', 'failed'] } 
    });
    
    const results = {
      total: pendingFaculty.length,
      success: [],
      failed: [],
    };
    
    for (const faculty of pendingFaculty) {
      const syncResult = await syncToMobileBackend(faculty);
      
      if (syncResult.success) {
        faculty.sync_status = 'synced';
        faculty.synced_at = new Date();
        faculty.sync_error = null;
        results.success.push(faculty.email);
      } else {
        faculty.sync_status = 'failed';
        faculty.sync_error = syncResult.error;
        faculty.sync_attempts += 1;
        results.failed.push({ email: faculty.email, error: syncResult.error });
      }
      
      await faculty.save();
    }
    
    res.json({
      message: 'Bulk sync completed',
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// NEW: Get sync status for dashboard
router.get('/sync/status', async (req, res) => {
  try {
    const total = await Faculty.countDocuments();
    const synced = await Faculty.countDocuments({ sync_status: 'synced' });
    const pending = await Faculty.countDocuments({ sync_status: 'pending' });
    const failed = await Faculty.countDocuments({ sync_status: 'failed' });
    
    const lastSync = await Faculty.findOne({ synced_at: { $ne: null } })
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

module.exports = router;