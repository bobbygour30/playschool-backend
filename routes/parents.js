const express = require('express');
const router = express.Router();
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const bcrypt = require('bcryptjs');
const syncToMobileBackend = require('../utils/syncParentToMobile');

// Only parents who actually have a login are pushed to the mobile backend
const shouldSync = (p) => !!process.env.MOBILE_BACKEND_URL && !!p.login_enabled;

// ==================== HELPERS ====================

// Ensures none of the given studentIds are already linked to a DIFFERENT parent.
// A student can only ever belong to one parent account at a time.
const ensureStudentsAreLinkable = async (studentIds = [], excludeParentId = null) => {
  if (!studentIds || studentIds.length === 0) return { valid: true };

  const query = { student_ids: { $in: studentIds } };
  if (excludeParentId) query._id = { $ne: excludeParentId };

  const conflictingParent = await Parent.findOne(query).select('father_name mother_name email student_ids');
  if (!conflictingParent) return { valid: true };

  return {
    valid: false,
    message: `One or more selected students are already linked to another parent (${conflictingParent.father_name || conflictingParent.email}). A student can only be linked to one parent account.`,
  };
};

// Get all parents
router.get('/', async (req, res) => {
  try {
    const { status, search, sync_status } = req.query;
    let query = {};

    if (status && status !== 'all') query.status = status;
    if (sync_status && sync_status !== 'all') query.sync_status = sync_status;

    if (search) {
      query.$or = [
        { father_name: { $regex: search, $options: 'i' } },
        { mother_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile_number: { $regex: search, $options: 'i' } },
      ];
    }

    const parents = await Parent.find(query)
      .select('-password')
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
      .select('-password')
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
    const parent = await Parent.findById(req.params.id).populate('student_ids');
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    res.json(parent.student_ids);
  } catch (error) {
    console.error('Error fetching parent students:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get students that CAN be linked to this parent:
// - student.parent_email must match this parent's email
// - the student must not already be linked to ANY parent (including this one)
router.get('/:id/available-students', async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    // 1. Students registered with this parent's email
    const matchingStudents = await Student.find({
      parent_email: { $regex: `^${parent.email}$`, $options: 'i' },
    });

    if (matchingStudents.length === 0) {
      return res.json([]);
    }

    const matchingIds = matchingStudents.map((s) => s._id);

    // 2. Find which of those are already linked to ANY parent
    const parentsWithLinks = await Parent.find(
      { student_ids: { $in: matchingIds } },
      'student_ids'
    );
    const linkedIds = new Set();
    parentsWithLinks.forEach((p) => p.student_ids.forEach((sid) => linkedIds.add(sid.toString())));

    const available = matchingStudents.filter((s) => !linkedIds.has(s._id.toString()));

    res.json(available);
  } catch (error) {
    console.error('Error fetching available students:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create parent with auto-sync
router.post('/', async (req, res) => {
  try {
    const {
      father_name, mother_name, guardian_name, mobile_number, email, address,
      student_ids, emergency_contact, contact_person_role, password, status, notes,
    } = req.body;

    const emailNorm = (email || '').trim().toLowerCase();

    if (!(father_name || '').trim() && !(mother_name || '').trim() && !(guardian_name || '').trim()) {
      return res.status(400).json({ message: "At least one of Father's, Mother's or Guardian's name is required" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password is required (minimum 6 characters)' });
    }

    const existingParent = await Parent.findOne({
      $or: [{ email: emailNorm }, { mobile_number }],
    });
    if (existingParent) {
      return res.status(400).json({
        message: existingParent.auto_created && !existingParent.login_enabled
          ? 'A parent record already exists for this email/mobile (auto-created from a student admission). Use Edit on that record to set the login password.'
          : 'Parent with this email or mobile number already exists',
      });
    }

    if (student_ids && student_ids.length > 0) {
      const check = await ensureStudentsAreLinkable(student_ids);
      if (!check.valid) return res.status(400).json({ message: check.message });
    }

    const parent = new Parent({
      father_name: father_name || '',
      mother_name: mother_name || '',
      guardian_name: guardian_name || '',
      mobile_number,
      email: emailNorm,
      address,
      student_ids: student_ids || [],
      emergency_contact,
      contact_person_role: contact_person_role || 'Father',
      password,
      status: status || 'Active',
      notes: notes || '',
      source: 'manual',
      auto_created: false,
      sync_status: 'pending',
    });

    const savedParent = await parent.save();
    await savedParent.populate('student_ids', 'name class_id section rollNumber');

    let syncResult = null;
    if (shouldSync(savedParent)) {
      syncResult = await syncToMobileBackend(savedParent);
      if (syncResult.success) {
        savedParent.sync_status = 'synced';
        savedParent.synced_at = new Date();
      } else {
        savedParent.sync_status = 'failed';
        savedParent.sync_error = syncResult.error;
        savedParent.sync_attempts = 1;
      }
      await savedParent.save();
    }

    const parentResponse = savedParent.toObject();
    delete parentResponse.password;

    res.status(201).json({ ...parentResponse, sync: syncResult || { message: 'Sync not configured' } });
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

    if (!studentId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const parent = await Parent.findById(id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // A student can only ever be linked to one parent account
    const check = await ensureStudentsAreLinkable([studentId], id);
    if (!check.valid) {
      return res.status(400).json({ message: check.message });
    }

    // The student must have been registered with this parent's email
    if (student.parent_email && student.parent_email.toLowerCase() !== parent.email.toLowerCase()) {
      return res.status(400).json({
        message: "This student's registered parent email does not match this parent account's email.",
      });
    }

    if (!parent.student_ids.includes(studentId)) {
      parent.student_ids.push(studentId);
      parent.sync_status = 'pending';
      await parent.save();
    }

    await parent.populate('student_ids', 'name class_id section rollNumber');

    // Auto-sync to mobile
    let syncResult = null;
    if (shouldSync(parent)) {
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
      sync: syncResult || { message: 'Sync not configured' },
    });
  } catch (error) {
    console.error('Error linking student:', error);
    res.status(500).json({ message: error.message });
  }
});

// Unlink student from parent — reason is mandatory and recorded for audit purposes
router.delete('/:id/link-student/:studentId', async (req, res) => {
  try {
    const { id, studentId } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A reason is required to unlink a student' });
    }

    const parent = await Parent.findById(id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    const isLinked = parent.student_ids.some((sId) => sId.toString() === studentId);
    if (!isLinked) {
      return res.status(400).json({ message: 'This student is not linked to this parent' });
    }

    const student = await Student.findById(studentId).select('name');

    parent.student_ids = parent.student_ids.filter((sId) => sId.toString() !== studentId);

    parent.unlink_history.push({
      student_id: studentId,
      student_name: student?.name || 'Unknown student',
      reason: reason.trim(),
      unlinked_at: new Date(),
    });

    parent.sync_status = 'pending';
    await parent.save();

    await parent.populate('student_ids', 'name class_id section rollNumber');

    // Auto-sync to mobile
    let syncResult = null;
    if (shouldSync(parent)) {
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
      sync: syncResult || { message: 'Sync not configured' },
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

    if (!parent.login_enabled) {
      return res.status(400).json({
        success: false,
        message: 'This parent has no login yet. Set a password first, then sync.',
      });
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
        sync: syncResult,
      });
    } else {
      parent.sync_status = 'failed';
      parent.sync_error = syncResult.error;
      parent.sync_attempts += 1;
      await parent.save();

      res.status(500).json({
        success: false,
        message: 'Force sync failed',
        error: syncResult.error,
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
      login_enabled: true,
      sync_status: { $in: ['pending', 'failed'] },
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

// Update parent
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingParent = await Parent.findById(id);
    if (!existingParent) return res.status(404).json({ message: 'Parent not found' });

    const {
      father_name, mother_name, guardian_name, mobile_number, email, address,
      student_ids, emergency_contact, contact_person_role, password, status, notes,
    } = req.body;

    const emailNorm = (email || '').trim().toLowerCase();

    if (!(father_name || '').trim() && !(mother_name || '').trim() && !(guardian_name || '').trim()) {
      return res.status(400).json({ message: "At least one of Father's, Mother's or Guardian's name is required" });
    }

    // Password is optional on edit, but if given it must be valid
    if (password && password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const duplicateCheck = await Parent.findOne({
      _id: { $ne: id },
      $or: [{ email: emailNorm }, { mobile_number }],
    });
    if (duplicateCheck) {
      return res.status(400).json({ message: 'Email or mobile number already exists for another parent' });
    }

    const nextStudentIds = student_ids !== undefined ? student_ids : existingParent.student_ids;
    if (student_ids) {
      const check = await ensureStudentsAreLinkable(student_ids, id);
      if (!check.valid) return res.status(400).json({ message: check.message });
    }

    const updateData = {
      father_name: father_name || '',
      mother_name: mother_name || '',
      guardian_name: guardian_name || '',
      mobile_number,
      email: emailNorm,
      address,
      student_ids: nextStudentIds,
      emergency_contact,
      contact_person_role: contact_person_role || 'Father',
      status: status || 'Active',
      notes: notes || '',
      updated_at: Date.now(),
      sync_status: 'pending',
    };

    // findByIdAndUpdate bypasses the pre-save hook, so hash + flag manually
    let passwordJustSet = false;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
      updateData.login_enabled = true;
      passwordJustSet = true;
    }

    const parent = await Parent.findByIdAndUpdate(id, updateData, { new: true });
    await parent.populate('student_ids', 'name class_id section rollNumber');

    let syncResult = null;
    try {
      if (shouldSync(parent) && process.env.MOBILE_SYNC_ENABLED !== 'false') {
        syncResult = await syncToMobileBackend(parent);
        if (syncResult && syncResult.success) {
          parent.sync_status = 'synced';
          parent.synced_at = new Date();
          parent.sync_error = null;
          await parent.save();
        } else if (syncResult && syncResult.skipped) {
          console.log(`Sync skipped for ${parent.email}`);
        } else {
          parent.sync_status = 'failed';
          parent.sync_error = syncResult?.error || 'Unknown error';
          await parent.save();
        }
      }
    } catch (syncError) {
      console.warn('Sync warning:', syncError.message);
    }

    const parentResponse = parent.toObject();
    delete parentResponse.password;

    res.json({
      ...parentResponse,
      login_just_enabled: passwordJustSet && !existingParent.login_enabled,
      sync: syncResult || { message: 'Sync not configured' },
    });
  } catch (error) {
    console.error('Error updating parent:', error);
    res.status(400).json({ message: error.message });
  }
});

router.get('/stats/overview', async (req, res) => {
  try {
    const [total, active, inactive, suspended] = await Promise.all([
      Parent.countDocuments(),
      Parent.countDocuments({ status: 'Active' }),
      Parent.countDocuments({ status: 'Inactive' }),
      Parent.countDocuments({ status: 'Suspended' }),
    ]);

    res.json({ total, active, inactive, suspended });
  } catch (error) {
    console.error('Error fetching parent stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete parent
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const parent = await Parent.findById(id);

    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    // Notify mobile backend about deletion
    if (shouldSync(parent) && process.env.MOBILE_SYNC_ENABLED !== 'false') {
      try {
        const axios = require('axios');
        await axios.delete(`${process.env.MOBILE_BACKEND_URL}/api/sync/parent/${parent._id}`, {
          headers: { 'X-Sync-Key': process.env.SYNC_SECRET_KEY },
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
      deletedEmail: parent.email,
    });
  } catch (error) {
    console.error('Error deleting parent:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;