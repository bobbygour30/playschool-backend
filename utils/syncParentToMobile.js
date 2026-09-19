// utils/syncParentToMobile.js
const axios = require('axios');

// The mobile backend's User model still requires `name` and `username`,
// but your current Parent schema no longer has `parent_name` or `username`
// fields (those were removed). This derives both from the fields that
// actually exist today, so the payload sent to the mobile backend is
// always valid.

const getContactName = (parentData) => {
  const role = parentData.contact_person_role || 'Father';
  if (role === 'Mother' && parentData.mother_name) return parentData.mother_name;
  if (role === 'Guardian') {
    // No dedicated guardian_name field exists, fall back sensibly
    return parentData.father_name || parentData.mother_name || 'Guardian';
  }
  // Default: Father
  return parentData.father_name || parentData.mother_name || 'Parent';
};

// Derive a stable, unique-enough username since the admin side no longer
// collects one. Email is already unique on the Parent schema, so basing
// the username on it guarantees no collisions on the mobile side either.
const deriveUsername = (parentData) => {
  if (!parentData.email) return undefined;
  return parentData.email.trim().toLowerCase();
};

const syncToMobileBackend = async (parentData) => {
  // Check if sync is enabled
  const syncEnabled = process.env.MOBILE_SYNC_ENABLED !== 'false';

  if (!syncEnabled) {
    console.log('🔴 Parent sync is disabled. Set MOBILE_SYNC_ENABLED=true to enable.');
    return { success: false, error: 'Sync is disabled', skipped: true };
  }

  try {
    const mobileBackendUrl = process.env.MOBILE_BACKEND_URL;
    const syncSecretKey = process.env.SYNC_SECRET_KEY;

    if (!mobileBackendUrl) {
      console.log('⚠️ MOBILE_BACKEND_URL not configured, skipping sync');
      return { success: false, error: 'Mobile backend URL not configured', skipped: true };
    }

    // Build payload with proper error checking
    const studentIds = parentData.student_ids?.map((s) => s._id?.toString() || s.toString()) || [];

    const payload = {
      parentId: parentData._id.toString(),
      name: getContactName(parentData),
      parentRole: parentData.contact_person_role || 'Father',
      email: parentData.email,
      mobileNumber: parentData.mobile_number,
      username: deriveUsername(parentData),
      password: parentData.password, // Already hashed
      address: parentData.address || '',
      emergencyContact: parentData.emergency_contact || '',
      studentIds: studentIds,
      students:
        parentData.student_ids?.map((s) => ({
          id: s._id?.toString() || s.toString(),
          name: s.name || s.student_name,
          class: s.class_id || s.class || 'Not Assigned',
          section: s.section || 'A',
          rollNumber: s.rollNumber || '',
        })) || [],
      status: parentData.status || 'Active',
      isActive: parentData.status === 'Active',
      notes: parentData.notes || '',
    };

    // Guard: fail fast locally with a clear message instead of letting the
    // mobile backend reject it with a vague 500, if something upstream is
    // still missing these fields.
    if (!payload.name || !payload.username) {
      const missing = [!payload.name && 'name', !payload.username && 'username'].filter(Boolean).join(', ');
      console.warn(`⚠️ Skipping sync for ${parentData.email}: could not derive required field(s): ${missing}`);
      return { success: false, error: `Could not derive required field(s): ${missing}`, skipped: false };
    }

    console.log(`📤 Syncing parent ${parentData.email} to mobile backend...`);
    console.log(`   Linked students: ${payload.studentIds.length}`);

    const response = await axios.post(`${mobileBackendUrl}/api/sync/parent`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Key': syncSecretKey,
      },
      timeout: 10000,
    });

    console.log(`✅ Parent ${parentData.email} synced successfully`);
    return { success: true, data: response.data };
  } catch (error) {
    // Don't log as error, just warn since sync is optional
    console.warn(`⚠️ Parent sync failed for ${parentData.email}: ${error.message}`);
    if (error.response) {
      console.warn(`   Response status: ${error.response.status}`);
      console.warn(`   Response data:`, error.response.data);
    }
    return {
      success: false,
      error: error.response?.data?.msg || error.message,
      skipped: false,
    };
  }
};

module.exports = syncToMobileBackend;