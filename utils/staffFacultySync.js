const Staff = require('../models/Staff');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const syncToMobileBackend = require('./syncToMobile');

const VALID_CLASSES = ['playgroup', 'nursery', 'lkg', 'ukg'];
const VALID_SECTIONS = ['A', 'B', 'C', 'D'];

// Faculty enum has no "Suspended"
const mapFacultyStatus = (staffStatus) =>
  staffStatus === 'Active' || staffStatus === 'On Leave' ? staffStatus : 'Inactive';

// Keep only valid, de-duplicated { class_id, section } pairs
const normalizeAssignments = (list) => {
  const seen = new Set();
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || !VALID_CLASSES.includes(a.class_id) || !VALID_SECTIONS.includes(a.section)) continue;
    const key = `${a.class_id}|${a.section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ class_id: a.class_id, section: a.section });
  }
  return out;
};

// Active teacher in charge of a class + section (or null)
const findTeacherForSlot = (classId, section) =>
  Staff.findOne({
    role: 'Teacher',
    status: 'Active',
    assignments: { $elemMatch: { class_id: classId, section } },
  });

// Fields on the Faculty record that are always copied from Staff (Staff = source of truth)
const facultyFieldsFromStaff = (staff) => {
  const assignments = (staff.assignments || []).map((a) => ({ class_id: a.class_id, section: a.section }));
  const first = assignments[0];
  return {
    faculty_name: staff.name,
    mobile_number: staff.phone,
    email: staff.email,
    qualification: staff.qualification,
    address: staff.address,
    assignments,
    assigned_class: first ? first.class_id : '',          // legacy/mobile: primary assignment
    assigned_section: first ? first.section : 'A',
    experience_years: staff.experience_years || 0,
    specialization: staff.specialization || '',
    joining_date: staff.date_of_joining,
  };
};

// Returns an error string if the teacher's assignments are invalid, otherwise null
const validateTeacherAssignment = async ({ role, assignments }, excludeStaffId = null) => {
  if (role !== 'Teacher') return null;

  const raw = Array.isArray(assignments) ? assignments : [];
  const clean = normalizeAssignments(raw);

  if (clean.length === 0) {
    return 'A Teacher must be assigned at least one class and section';
  }
  if (clean.length !== raw.length) {
    return 'Assignments contain an invalid or duplicate class/section';
  }

  for (const a of clean) {
    const query = {
      role: 'Teacher',
      assignments: { $elemMatch: { class_id: a.class_id, section: a.section } },
    };
    if (excludeStaffId) query._id = { $ne: excludeStaffId };
    const conflict = await Staff.findOne(query).select('name');
    if (conflict) {
      return `${conflict.name} is already the teacher of ${a.class_id.toUpperCase()} - Section ${a.section}`;
    }
  }
  return null;
};

// Re-point students to this teacher for every class + section they hold
const syncStudentsForTeacher = async (staff) => {
  // release everything currently linked to this teacher
  await Student.updateMany({ assigned_teacher_id: staff._id }, { $set: { assigned_teacher_id: null } });

  const canTeach =
    staff.role === 'Teacher' && staff.status === 'Active' && (staff.assignments || []).length > 0;
  if (!canTeach) return;

  await Student.updateMany(
    {
      status: { $ne: 'Graduated' },
      $or: staff.assignments.map((a) => ({ class_id: a.class_id, section: a.section })),
    },
    { $set: { assigned_teacher_id: staff._id } }
  );
};

// Push staff changes into the linked faculty account (and mobile backend)
const syncFacultyFromStaff = async (staff) => {
  try {
    const faculty = await Faculty.findOne({ staff_id: staff._id });
    if (!faculty) return null;

    const stillTeacher = staff.role === 'Teacher';
    const update = {
      ...facultyFieldsFromStaff(staff),
      status: stillTeacher ? mapFacultyStatus(staff.status) : 'Inactive',
      updated_at: Date.now(),
      sync_status: 'pending',
    };

    const updated = await Faculty.findByIdAndUpdate(faculty._id, update, { new: true });

    if (process.env.MOBILE_BACKEND_URL) {
      const result = await syncToMobileBackend(updated);
      if (result.success) {
        await Faculty.findByIdAndUpdate(updated._id, {
          sync_status: 'synced', synced_at: new Date(), sync_error: null,
        });
      } else {
        await Faculty.findByIdAndUpdate(updated._id, {
          sync_status: 'failed', sync_error: result.error, $inc: { sync_attempts: 1 },
        });
      }
    }
    return updated;
  } catch (err) {
    console.error('syncFacultyFromStaff error:', err.message);
    return null;
  }
};

module.exports = {
  VALID_CLASSES,
  VALID_SECTIONS,
  mapFacultyStatus,
  normalizeAssignments,
  findTeacherForSlot,
  facultyFieldsFromStaff,
  validateTeacherAssignment,
  syncStudentsForTeacher,
  syncFacultyFromStaff,
};