// utils/parentAutoSync.js
// Creates / links a Parent account from a Student's parent details.
const Parent = require('../models/Parent');

const norm = (e) => (e || '').trim().toLowerCase();

// Which name field should the single "parent_name" on the student form go into?
const nameFieldsFor = (student) => {
  const rel = student.parent_relationship || 'Mother';
  const name = (student.parent_name || '').trim();
  if (rel === 'Father') return { father_name: name, role: 'Father' };
  if (rel === 'Mother') return { mother_name: name, role: 'Mother' };
  return { guardian_name: name, role: 'Guardian' };
};

// Fill empty name fields from a sibling's admission (never overwrites existing values)
const fillMissingNames = (parent, student) => {
  const n = nameFieldsFor(student);
  let changed = false;
  ['father_name', 'mother_name', 'guardian_name'].forEach((f) => {
    if (n[f] && !parent[f]) {
      parent[f] = n[f];
      changed = true;
    }
  });
  return changed;
};

/**
 * @param {Object} student  Student document (or lean object)
 * @param {Object} opts     { dryRun?: boolean, seen?: Map, _retry?: boolean }
 * @returns {Object} { action, parentId?, reason? }
 *   action: created | linked | already-linked | skipped | conflict |
 *           would-create | would-link
 */
async function upsertParentFromStudent(student, opts = {}) {
  const { dryRun = false, seen = new Map(), _retry = false } = opts;

  const email = norm(student.parent_email);
  const mobile = (student.parent_phone || '').trim();

  if (!email) return { action: 'skipped', reason: 'Student has no parent email' };
  if (!mobile) return { action: 'skipped', reason: 'Student has no parent phone' };

  // 1. Is this student already linked to some parent?
  const linked = await Parent.findOne({ student_ids: student._id });
  if (linked) {
    if (linked.email === email) {
      const changed = fillMissingNames(linked, student);
      if (changed && !dryRun) await linked.save();
      return { action: 'already-linked', parentId: linked._id };
    }

    // Linked under a different email than the student's current parent_email
    if (linked.login_enabled) {
      return {
        action: 'skipped',
        reason: `Student is linked to ${linked.email} (has login) but student's parent email is ${email}. Resolve manually.`,
      };
    }

    // Old parent has no login yet → safe to move the student to the new email's parent
    if (!dryRun) {
      linked.student_ids.pull(student._id);
      linked.unlink_history.push({
        student_id: student._id,
        student_name: student.name || '',
        reason: 'Parent email changed on student record (auto-moved)',
        unlinked_at: new Date(),
      });
      if (linked.auto_created && linked.student_ids.length === 0) {
        await Parent.deleteOne({ _id: linked._id });
      } else {
        await linked.save();
      }
    }
  }

  // 2. Parent with this email already exists → link (siblings share one account)
  const existing = await Parent.findOne({ email });
  if (existing) {
    const already = existing.student_ids.some((id) => String(id) === String(student._id));
    if (!already) {
      existing.student_ids.push(student._id);
      existing.sync_status = 'pending';
    }
    fillMissingNames(existing, student);
    if (!dryRun) await existing.save();
    return { action: 'linked', parentId: existing._id };
  }

  // 3. Mobile number already used by a parent with a different email → can't create (unique index)
  const mobileOwner = await Parent.findOne({ mobile_number: mobile });
  if (mobileOwner) {
    return {
      action: 'conflict',
      reason: `Mobile ${mobile} already belongs to parent ${mobileOwner.email} (student email: ${email})`,
    };
  }

  // 4. Create a new parent (no password yet)
  if (dryRun) {
    if (seen.has(email)) return { action: 'would-link' };
    seen.set(email, true);
    return { action: 'would-create' };
  }

  const n = nameFieldsFor(student);
  try {
    const parent = await Parent.create({
      father_name: n.father_name || '',
      mother_name: n.mother_name || '',
      guardian_name: n.guardian_name || '',
      mobile_number: mobile,
      email,
      address: student.address || 'N/A',
      student_ids: [student._id],
      emergency_contact: student.emergency_contact?.phone || mobile,
      contact_person_role: n.role,
      status: 'Active',
      auto_created: true,
      source: 'student_registration',
      login_enabled: false,
      sync_status: 'pending',
    });
    return { action: 'created', parentId: parent._id };
  } catch (err) {
    // Two students saved at the same instant with the same email → one wins, other retries as "link"
    if (err.code === 11000 && !_retry) {
      return upsertParentFromStudent(student, { ...opts, _retry: true });
    }
    throw err;
  }
}

module.exports = { upsertParentFromStudent };