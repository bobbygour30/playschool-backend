// utils/syncHolidayLeaveToMobile.js
const axios = require('axios');

const getConfig = () => {
  const mobileBackendUrl = process.env.MOBILE_BACKEND_URL;
  const syncSecretKey = process.env.SYNC_SECRET_KEY;

  if (!mobileBackendUrl) {
    return { error: 'Mobile backend URL not configured' };
  }
  return { mobileBackendUrl, syncSecretKey };
};

// ==================== HOLIDAY SYNC ====================
const syncHolidayToMobile = async (holiday) => {
  try {
    const cfg = getConfig();
    if (cfg.error) {
      console.log('MOBILE_BACKEND_URL not configured, skipping holiday sync');
      return { success: false, error: cfg.error };
    }

    const payload = {
      holidayId: holiday._id.toString(),
      date: holiday.date,
      name: holiday.name,
      type: holiday.type,
      description: holiday.description || '',
      color: holiday.color || '#FF6B6B',
      forFaculty: holiday.for_faculty !== undefined ? holiday.for_faculty : true,
      forStudents: holiday.for_students !== undefined ? holiday.for_students : true,
      affectedClasses: holiday.affected_classes || [],
    };

    console.log(`Syncing holiday "${holiday.name}" (${holiday.date.toISOString().split('T')[0]}) to mobile`);

    const response = await axios.post(
      `${cfg.mobileBackendUrl}/api/sync/holiday`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Key': cfg.syncSecretKey,
        },
        timeout: 10000,
      }
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Holiday sync failed:', error.message);
    return {
      success: false,
      error: error.response?.data?.msg || error.message,
    };
  }
};

const deleteHolidayFromMobile = async (holidayId) => {
  try {
    const cfg = getConfig();
    if (cfg.error) return { success: false, error: cfg.error };

    const response = await axios.delete(
      `${cfg.mobileBackendUrl}/api/sync/holiday/${holidayId}`,
      {
        headers: { 'X-Sync-Key': cfg.syncSecretKey },
        timeout: 10000,
      }
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Holiday delete sync failed:', error.message);
    return {
      success: false,
      error: error.response?.data?.msg || error.message,
    };
  }
};

// ==================== LEAVE SYNC ====================
const syncLeaveToMobile = async (leave) => {
  try {
    const cfg = getConfig();
    if (cfg.error) {
      console.log('MOBILE_BACKEND_URL not configured, skipping leave sync');
      return { success: false, error: cfg.error };
    }

    const payload = {
      leaveId: leave._id.toString(),
      userId: leave.user_id.toString(),
      userType: leave.user_type,
      leaveType: leave.leave_type,
      fromDate: leave.from_date,
      toDate: leave.to_date,
      reason: leave.reason,
      status: leave.status,
      assignedClass: leave.assigned_class || null,
      assignedSection: leave.assigned_section || null,
      substituteTeacherId: leave.substitute_teacher_id
        ? leave.substitute_teacher_id.toString()
        : null,
      substituteTeacherName: leave.substitute_teacher_name || null,
      substituteNotes: leave.substitute_notes || '',
      approvedBy: leave.approved_by ? leave.approved_by.toString() : null,
      approvedByName: leave.approved_by_name || null,
      approvedAt: leave.approved_at,
      rejectionReason: leave.rejection_reason || null,
      durationDays: leave.duration_days || 0,
      createdAt: leave.created_at,
      updatedAt: leave.updated_at,
    };

    console.log(`Syncing leave ${leave._id} (${leave.user_type}) status=${leave.status}`);

    const response = await axios.post(
      `${cfg.mobileBackendUrl}/api/sync/leave`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Key': cfg.syncSecretKey,
        },
        timeout: 10000,
      }
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Leave sync failed:', error.message);
    return {
      success: false,
      error: error.response?.data?.msg || error.message,
    };
  }
};

const deleteLeaveFromMobile = async (leaveId) => {
  try {
    const cfg = getConfig();
    if (cfg.error) return { success: false, error: cfg.error };

    const response = await axios.delete(
      `${cfg.mobileBackendUrl}/api/sync/leave/${leaveId}`,
      {
        headers: { 'X-Sync-Key': cfg.syncSecretKey },
        timeout: 10000,
      }
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Leave delete sync failed:', error.message);
    return {
      success: false,
      error: error.response?.data?.msg || error.message,
    };
  }
};

// ==================== LEAVE SETTINGS SYNC ====================
const syncLeaveSettingsToMobile = async (settings) => {
  try {
    const cfg = getConfig();
    if (cfg.error) {
      console.log('MOBILE_BACKEND_URL not configured, skipping settings sync');
      return { success: false, error: cfg.error };
    }

    const payload = {
      settingsId: settings._id.toString(),
      leave_limits: settings.leave_limits,
      holiday_settings: settings.holiday_settings,
      notifications: settings.notifications,
    };

    console.log('Syncing leave settings to mobile');

    const response = await axios.post(
      `${cfg.mobileBackendUrl}/api/sync/leave-settings`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Key': cfg.syncSecretKey,
        },
        timeout: 10000,
      }
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Leave settings sync failed:', error.message);
    return {
      success: false,
      error: error.response?.data?.msg || error.message,
    };
  }
};

module.exports = {
  syncHolidayToMobile,
  deleteHolidayFromMobile,
  syncLeaveToMobile,
  deleteLeaveFromMobile,
  syncLeaveSettingsToMobile,
};