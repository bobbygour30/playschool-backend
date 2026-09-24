const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Faculty = require('../models/Faculty');
const Staff = require('../models/Staff');
const bcrypt = require('bcryptjs');
const syncToMobileBackend = require('../utils/syncToMobile');
const { facultyFieldsFromStaff, mapFacultyStatus } = require('../utils/staffFacultySync');

// ==================== GET ELIGIBLE STAFF (Teachers without a faculty account) ====================
router.get('/eligible-staff', async (req, res) => {
  try {
    const linkedIds = (await Faculty.distinct('staff_id')).filter(Boolean);

    const staff = await Staff.find({
      role: 'Teacher',
      status: 'Active',
      'assignments.0': { $exists: true },       // has at least one class+section
      _id: { $nin: linkedIds },
    })
      .select('name email phone qualification address assignments specialization experience_years designation')
      .sort({ name: 1 });

    res.json(staff);
  } catch (error) {
    console.error('Error fetching eligible staff:', error);
    res.status(500).json({ message: error.message });
  }
});

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
    
    const faculty = await Faculty.find(query)
      .populate('staff_id', 'name email phone')
      .sort({ created_at: -1 });
    res.json(faculty);
  } catch (error) {
    console.error('Error fetching faculty:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get faculty by ID
router.get('/:id', async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id)
      .populate('staff_id', 'name email phone');
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    res.json(faculty);
  } catch (error) {
    console.error('Error fetching faculty:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create faculty (STAFF-LINKED + multi-assignment version)
router.post('/', async (req, res) => {
  try {
    const { staff_id, employee_id, username, password, subject, status, notes } = req.body;

    // 1) A faculty account MUST come from an existing staff member
    if (!staff_id || !mongoose.isValidObjectId(staff_id)) {
      return res.status(400).json({ message: 'Please select a staff member. Create the staff member in Staff Management first.' });
    }
    const staff = await Staff.findById(staff_id);
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found. Create the staff member first.' });
    }
    if (staff.role !== 'Teacher') {
      return res.status(400).json({ message: 'Faculty accounts can only be created for staff with role Teacher' });
    }
    if (!staff.assignments || staff.assignments.length === 0) {
      return res.status(400).json({ message: 'Assign at least one class and section to this teacher in Staff Management first' });
    }
    if (await Faculty.findOne({ staff_id: staff._id })) {
      return res.status(400).json({ message: 'This staff member already has a faculty account' });
    }

    if (!employee_id || !username || !password) {
      return res.status(400).json({ message: 'Employee ID, username and password are required' });
    }

    const duplicate = await Faculty.findOne({
      $or: [
        { email: staff.email },
        { mobile_number: staff.phone },
        { username },
        { employee_id },
      ],
    });
    if (duplicate) {
      return res.status(400).json({ message: 'Faculty with this email, username, employee ID, or mobile number already exists' });
    }

    // 2) Identity/class data comes from Staff, NOT from the request body
    const faculty = new Faculty({
      staff_id: staff._id,
      ...facultyFieldsFromStaff(staff),
      subject: (subject || staff.specialization || '').trim(),
      employee_id,
      username,
      password,
      status: staff.status === 'Active' ? (status || 'Active') : mapFacultyStatus(staff.status),
      notes: notes || '',
      sync_status: 'pending',
    });

    const savedFaculty = await faculty.save();

    let syncResult = null;
    if (process.env.MOBILE_BACKEND_URL) {
      syncResult = await syncToMobileBackend(savedFaculty);
      if (syncResult.success) {
        savedFaculty.sync_status = 'synced';
        savedFaculty.synced_at = new Date();
      } else {
        savedFaculty.sync_status = 'failed';
        savedFaculty.sync_error = syncResult.error;
        savedFaculty.sync_attempts = 1;
      }
      await savedFaculty.save();
    }

    const facultyResponse = savedFaculty.toObject();
    delete facultyResponse.password;

    res.status(201).json({ ...facultyResponse, sync: syncResult || { message: 'Sync not configured' } });
  } catch (error) {
    console.error('Error creating faculty:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update faculty (account-level fields only; identity/class from Staff)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingFaculty = await Faculty.findById(id);
    if (!existingFaculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    // Faculty must still be linked to a real staff member
    const staff = existingFaculty.staff_id ? await Staff.findById(existingFaculty.staff_id) : null;
    if (!staff) {
      return res.status(400).json({
        message: 'This faculty account is not linked to a staff member. Link it (migration) or recreate it from Staff.',
      });
    }

    // Only account-level fields are editable here
    const { employee_id, username, password, subject, status, notes } = req.body;

    const duplicate = await Faculty.findOne({
      _id: { $ne: id },
      $or: [{ username }, { employee_id }],
    });
    if (duplicate) {
      return res.status(400).json({ message: 'Another faculty already uses this username or employee ID' });
    }

    const updateData = {
      ...facultyFieldsFromStaff(staff),           // name/assignments/etc. always from Staff
      subject: (subject ?? existingFaculty.subject ?? '').trim(),
      employee_id,
      username,
      status: staff.status === 'Active' ? (status || existingFaculty.status) : mapFacultyStatus(staff.status),
      notes: notes || '',
      updated_at: Date.now(),
      sync_status: 'pending',
    };

    if (password && password !== existingFaculty.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const faculty = await Faculty.findByIdAndUpdate(id, updateData, { new: true })
      .populate('staff_id', 'name email phone');

    let syncResult = null;
    if (process.env.MOBILE_BACKEND_URL) {
      syncResult = await syncToMobileBackend(faculty);
      if (syncResult.success) {
        faculty.sync_status = 'synced';
        faculty.synced_at = new Date();
        faculty.sync_error = null;
      } else {
        faculty.sync_status = 'failed';
        faculty.sync_error = syncResult.error;
        faculty.sync_attempts += 1;
      }
      await faculty.save();
    }

    const facultyResponse = faculty.toObject();
    delete facultyResponse.password;

    res.json({ ...facultyResponse, sync: syncResult || { message: 'Sync not configured' } });
  } catch (error) {
    console.error('Error updating faculty:', error);
    res.status(400).json({ message: error.message });
  }
});

// Force re-sync
router.post('/:id/force-resync', async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id)
      .populate('staff_id', 'name email phone');
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
        success: true,
        message: 'Force sync successful', 
        sync: syncResult 
      });
    } else {
      faculty.sync_status = 'failed';
      faculty.sync_error = syncResult.error;
      faculty.sync_attempts += 1;
      await faculty.save();
      
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

// Delete faculty
router.delete('/:id', async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id);
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    
    const facultyId = faculty._id.toString();
    const facultyEmail = faculty.email;
    
    await Faculty.findByIdAndDelete(req.params.id);
    
    if (process.env.MOBILE_BACKEND_URL) {
      try {
        const axios = require('axios');
        await axios.delete(`${process.env.MOBILE_BACKEND_URL}/api/sync/faculty/${facultyId}`, {
          headers: { 'X-Sync-Key': process.env.SYNC_SECRET_KEY }
        });
        console.log(`Faculty ${facultyEmail} deleted from mobile`);
      } catch (syncError) {
        console.error('Failed to notify mobile about deletion:', syncError.message);
      }
    }
    
    res.json({ 
      success: true,
      message: 'Faculty deleted successfully',
      deletedEmail: facultyEmail
    });
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
      { 
        status, 
        updated_at: Date.now(),
        sync_status: 'pending' 
      },
      { new: true }
    ).populate('staff_id', 'name email phone');
    
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    
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

// Retry failed sync
router.post('/:id/retry-sync', async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id)
      .populate('staff_id', 'name email phone');
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    
    const syncResult = await syncToMobileBackend(faculty);
    
    if (syncResult.success) {
      faculty.sync_status = 'synced';
      faculty.synced_at = new Date();
      faculty.sync_error = null;
      await faculty.save();
      
      res.json({ message: 'Sync retry successful', sync: syncResult });
    } else {
      faculty.sync_status = 'failed';
      faculty.sync_error = syncResult.error;
      faculty.sync_attempts += 1;
      await faculty.save();
      
      res.status(500).json({ message: 'Sync retry failed', error: syncResult.error });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bulk sync
router.post('/bulk-sync', async (req, res) => {
  try {
    const pendingFaculty = await Faculty.find({ 
      sync_status: { $in: ['pending', 'failed'] } 
    });
    
    const results = { total: pendingFaculty.length, success: [], failed: [] };
    
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
    
    res.json({ message: 'Bulk sync completed', results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get sync status
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