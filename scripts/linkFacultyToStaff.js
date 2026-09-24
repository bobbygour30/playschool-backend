require('dotenv').config();
const mongoose = require('mongoose');
const Faculty = require('../models/Faculty');
const Staff = require('../models/Staff');
const Student = require('../models/Student');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const faculties = await Faculty.find({});
  const orphans = [];

  for (const f of faculties) {
    const staff = await Staff.findOne({ email: f.email.toLowerCase().trim(), role: 'Teacher' });

    if (!staff) {
      orphans.push(`${f.faculty_name} <${f.email}>`);
      continue;
    }

    // link faculty -> staff (updateOne avoids validation/pre-save hooks)
    await Faculty.updateOne({ _id: f._id }, { $set: { staff_id: staff._id } });

    // if staff has no valid class key yet, copy class/section from the faculty record
    const validClasses = ['playgroup', 'nursery', 'lkg', 'ukg'];
    if (!validClasses.includes(staff.assigned_class_id) && validClasses.includes(f.assigned_class)) {
      await Staff.updateOne(
        { _id: staff._id },
        { $set: { assigned_class_id: f.assigned_class, assigned_section: f.assigned_section || 'A' } }
      );
    }
    console.log(`Linked ${f.faculty_name} -> staff ${staff._id}`);
  }

  console.log('\nFaculty with NO matching Teacher in Staff (create the staff member, then re-run):');
  orphans.forEach((o) => console.log(' -', o));

  // Then re-link students to teachers by class + section
  const teachers = await Staff.find({ role: 'Teacher', status: 'Active', assigned_class_id: { $in: ['playgroup', 'nursery', 'lkg', 'ukg'] } });
  for (const t of teachers) {
    await Student.updateMany(
      { class_id: t.assigned_class_id, section: t.assigned_section, status: { $ne: 'Graduated' } },
      { $set: { assigned_teacher_id: t._id } }
    );
  }

  await mongoose.disconnect();
})();