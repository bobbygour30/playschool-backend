// utils/studentDuplicate.js
const Student = require('../models/Student');

const normName = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normEmail = (s) => (s || '').trim().toLowerCase();
const normPhone = (s) => (s || '').replace(/\D/g, '');

// Day range (UTC) for a YYYY-MM-DD / ISO date, matching how dob is stored
const dayRange = (d) => {
  const date = new Date(d);
  if (isNaN(date)) return null;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
};

/**
 * Returns the existing Student that is the same child, or null.
 * Same child = same name + same DOB + (same parent email OR same parent phone)
 */
async function findDuplicateStudent(
  { name, date_of_birth, parent_email, parent_phone },
  excludeId = null
) {
  const range = dayRange(date_of_birth);
  if (!name || !range) return null;

  const query = { date_of_birth: { $gte: range.start, $lt: range.end } };
  if (excludeId) query._id = { $ne: excludeId };

  const sameDob = await Student.find(query).select(
    'name parent_email parent_phone class_id section date_of_birth'
  );

  const n = normName(name);
  const e = normEmail(parent_email);
  const p = normPhone(parent_phone);

  return (
    sameDob.find(
      (s) =>
        normName(s.name) === n &&
        ((e && normEmail(s.parent_email) === e) || (p && normPhone(s.parent_phone) === p))
    ) || null
  );
}

// In-process lock so two simultaneous requests (double-click / retry) can't both pass the check
const inFlight = new Set();
const lockKey = ({ name, date_of_birth, parent_email }) =>
  `${normName(name)}|${String(date_of_birth).slice(0, 10)}|${normEmail(parent_email)}`;

const acquireLock = (data) => {
  const key = lockKey(data);
  if (inFlight.has(key)) return null;
  inFlight.add(key);
  return key;
};
const releaseLock = (key) => key && inFlight.delete(key);

module.exports = { findDuplicateStudent, acquireLock, releaseLock, normName };