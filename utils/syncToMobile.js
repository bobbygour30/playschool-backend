const axios = require('axios');

const syncToMobileBackend = async (facultyData) => {
  try {
    const mobileBackendUrl = process.env.MOBILE_BACKEND_URL;
    const syncSecretKey = process.env.SYNC_SECRET_KEY;
    
    if (!mobileBackendUrl) {
      console.log('MOBILE_BACKEND_URL not configured, skipping sync');
      return { success: false, error: 'Mobile backend URL not configured' };
    }
    
    // FIX: Ensure we're sending the already hashed password
    // The password in facultyData is already hashed by the pre-save hook
    const payload = {
      facultyId: facultyData._id.toString(),
      name: facultyData.faculty_name,
      email: facultyData.email,
      mobileNumber: facultyData.mobile_number,
      username: facultyData.username,
      password: facultyData.password, // This is already hashed from web
      employeeId: facultyData.employee_id,
      assignedClass: facultyData.assigned_class,
      assignedSection: facultyData.assigned_section,
      subject: facultyData.subject,
      qualification: facultyData.qualification,
      experienceYears: facultyData.experience_years,
      joiningDate: facultyData.joining_date,
      profilePicture: facultyData.profile_picture,
      status: facultyData.status,
      isActive: facultyData.status === 'Active',
      address: facultyData.address,
      specialization: facultyData.specialization,
      notes: facultyData.notes,
    };
    
    console.log(`Syncing faculty ${facultyData.email} to mobile backend`);
    console.log(`Password hash length: ${facultyData.password?.length || 0}`);
    
    const response = await axios.post(`${mobileBackendUrl}/api/sync/faculty`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Key': syncSecretKey,
      },
      timeout: 10000, // 10 seconds timeout
    });
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Sync to mobile failed:', error.message);
    return { 
      success: false, 
      error: error.response?.data?.msg || error.message 
    };
  }
};

module.exports = syncToMobileBackend;