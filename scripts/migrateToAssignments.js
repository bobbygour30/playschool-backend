// scripts/migrateToAssignments.js
require('dotenv').config();
const mongoose = require('mongoose');

const VALID_CLASSES = ['playgroup', 'nursery', 'lkg', 'ukg'];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const staffCol = db.collection('staffs');        // check your real collection names
  const facultyCol = db.collection('faculties');
  const studentCol = db.collection('students');

  // 1) Staff: legacy assigned_class_id/assigned_section -> assignments[]
  const teachers = await staffCol.find({ role: 'Teacher' }).toArray();
  for (const t of teachers) {
    if (Array.isArray(t.assignments) && t.assignments.length) continue;
    const assignments = VALID_CLASSES.includes(t.assigned_class_id)
      ? [{ class_id: t.assigned_class_id, section: t.assigned_section || 'A' }]
      : [];
    await staffCol.updateOne(
      { _id: t._id },
      { $set: { assignments }, $unset: { assigned_class_id: '', assigned_section: '' } }
    );
  }

  // 2) Faculty: link to staff by email; if staff has no assignment yet, borrow the faculty's
  const orphans = [];
  for (const f of await facultyCol.find({}).toArray()) {
    const staff = await staffCol.findOne({ email: String(f.email).toLowerCase().trim(), role: 'Teacher' });
    if (!staff) { orphans.push(`${f.faculty_name} <${f.email}>`); continue; }

    let assignments = staff.assignments || [];
    if (assignments.length === 0 && VALID_CLASSES.includes(f.assigned_class)) {
      assignments = [{ class_id: f.assigned_class, section: f.assigned_section || 'A' }];
      await staffCol.updateOne({ _id: staff._id }, { $set: { assignments } });
    }
    await facultyCol.updateOne(
      { _id: f._id },
      { $set: { staff_id: staff._id, assignments } }
    );
    console.log(`Linked ${f.faculty_name} -> staff ${staff._id}`);
  }
  console.log('\nFaculty with NO matching Teacher in Staff (create the staff member, then re-run):');
  orphans.forEach((o) => console.log(' -', o));

  // 3) Students: re-link teacher by class + section
  const active = await staffCol.find({ role: 'Teacher', status: 'Active', 'assignments.0': { $exists: true } }).toArray();
  for (const t of active) {
    for (const a of t.assignments) {
      await studentCol.updateMany(
        { class_id: a.class_id, section: a.section, status: { $ne: 'Graduated' } },
        { $set: { assigned_teacher_id: t._id } }
      );
    }
  }

  await mongoose.disconnect();
})();