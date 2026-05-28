const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const Student = require('./models/Student');

async function syncStudentsToMobile() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const students = await Student.find();
    console.log(`Found ${students.length} students to sync`);
    
    const studentsForSync = students.map(student => ({
      name: student.name,
      rollNumber: student.rollNumber,
      class_id: student.class_id,
      section: student.section || 'A',
      parent_name: student.parent_name,
      parent_phone: student.parent_phone,
      parent_email: student.parent_email,
      date_of_birth: student.date_of_birth,
      gender: student.gender,
      address: student.address,
      status: student.status,
    }));
    
    const response = await axios.post(
      `${process.env.MOBILE_BACKEND_URL}/api/sync/students`,
      { students: studentsForSync },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Key': process.env.SYNC_SECRET_KEY
        }
      }
    );
    
    console.log('Sync result:', response.data);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

syncStudentsToMobile();