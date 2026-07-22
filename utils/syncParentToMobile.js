// utils/syncParentToMobile.js
const axios = require('axios');

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
    const studentIds = parentData.student_ids?.map(s => s._id?.toString() || s.toString()) || [];
    
    const payload = {
      parentId: parentData._id.toString(),
      name: parentData.parent_name,
      parentRole: parentData.parent_role || 'Father',
      email: parentData.email,
      mobileNumber: parentData.mobile_number,
      username: parentData.username,
      password: parentData.password, // Already hashed
      address: parentData.address || '',
      emergencyContact: parentData.emergency_contact || '',
      studentIds: studentIds,
      students: parentData.student_ids?.map(s => ({
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
      skipped: false
    };
  }
};

module.exports = syncToMobileBackend;