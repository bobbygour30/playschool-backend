/**
 * Script to fix existing student-teacher relationships
 * Run: node fix-student-teacher-relationship.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Student = require('./models/Student');
const Staff = require('./models/Staff');

async function fixStudentTeacherRelationship() {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/playschool';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB\n');

    console.log('='.repeat(60));
    console.log('FIXING EXISTING STUDENT-TEACHER RELATIONSHIPS');
    console.log('='.repeat(60));

    // Get all students
    const students = await Student.find();
    console.log(`\n📊 Found ${students.length} total students\n`);

    let fixedCount = 0;
    let alreadyAssigned = 0;
    let noTeacherFound = 0;
    let errors = [];

    // Class name mapping for better matching
    const classNames = {
      'toddler': 'Toddler',
      'pre-nursery': 'Pre-Nursery',
      'nursery': 'Nursery',
      'kg-1': 'KG-1'
    };

    for (const student of students) {
      console.log(`\n📖 Processing: ${student.name}`);
      console.log(`   Class: ${student.class_id || 'Not set'}, Section: ${student.section || 'A'}`);

      // Skip if already has teacher assigned
      if (student.assigned_teacher_id) {
        console.log(`   ℹ️ Already has teacher assigned: ${student.assigned_teacher_id}`);
        alreadyAssigned++;
        continue;
      }

      if (!student.class_id) {
        console.log(`   ⚠️ Skipping - No class assigned`);
        noTeacherFound++;
        continue;
      }

      // Method 1: Find teacher by assigned_class_id
      let teacher = await Staff.findOne({
        role: 'Teacher',
        status: 'Active',
        $or: [
          { assigned_class_id: student.class_id },
          { 'assigned_class_id._id': student.class_id }
        ]
      });

      // Method 2: If no teacher found, try by class name in designation
      if (!teacher && classNames[student.class_id]) {
        teacher = await Staff.findOne({
          role: 'Teacher',
          status: 'Active',
          designation: { $regex: classNames[student.class_id], $options: 'i' }
        });
      }

      // Method 3: If still no teacher, try by name containing class name
      if (!teacher && classNames[student.class_id]) {
        teacher = await Staff.findOne({
          role: 'Teacher',
          status: 'Active',
          name: { $regex: classNames[student.class_id], $options: 'i' }
        });
      }

      // Method 4: Use any active teacher as fallback
      if (!teacher) {
        teacher = await Staff.findOne({ role: 'Teacher', status: 'Active' });
        if (teacher) {
          console.log(`   ℹ️ Using default teacher: ${teacher.name}`);
        }
      }

      if (teacher) {
        try {
          student.assigned_teacher_id = teacher._id;
          await student.save();
          fixedCount++;
          console.log(`   ✅ FIXED: Assigned to ${teacher.name} (${teacher.designation || 'Teacher'})`);
        } catch (err) {
          errors.push({ student: student.name, error: err.message });
          console.log(`   ❌ Error saving: ${err.message}`);
        }
      } else {
        noTeacherFound++;
        console.log(`   ❌ No teacher found for class: ${student.class_id}`);
        errors.push({ student: student.name, error: 'No matching teacher found' });
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`📊 Total Students Processed: ${students.length}`);
    console.log(`✅ Successfully Fixed: ${fixedCount}`);
    console.log(`ℹ️ Already Had Teacher: ${alreadyAssigned}`);
    console.log(`❌ No Teacher Found: ${noTeacherFound}`);
    console.log(`⚠️ Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n📋 Error Details:');
      errors.forEach(err => {
        console.log(`   - ${err.student}: ${err.error}`);
      });
    }

    // Verification
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION');
    console.log('='.repeat(60));

    const verifiedStudents = await Student.find().populate('assigned_teacher_id', 'name');
    const withTeacher = verifiedStudents.filter(s => s.assigned_teacher_id).length;
    const withoutTeacher = verifiedStudents.length - withTeacher;

    console.log(`\n📊 Final Status:`);
    console.log(`   Students with teacher: ${withTeacher}`);
    console.log(`   Students without teacher: ${withoutTeacher}`);
    console.log(`   Success rate: ${Math.round((withTeacher / verifiedStudents.length) * 100)}%`);

    if (withoutTeacher > 0) {
      console.log('\n📋 Students still without teacher:');
      verifiedStudents.filter(s => !s.assigned_teacher_id).forEach(s => {
        console.log(`   - ${s.name} (Class: ${s.class_id}, Section: ${s.section || 'A'})`);
      });

      console.log('\n💡 Suggestions:');
      console.log('   1. Create teachers in Staff Management module');
      console.log('   2. Assign classes to teachers in Staff Management');
      console.log('   3. Manually assign teachers to students in Student Details');
    }

    console.log('\n✅ Script completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the function
fixStudentTeacherRelationship();