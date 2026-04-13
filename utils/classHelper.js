// Standard classes mapping for PlaySchool
const STANDARD_CLASSES = {
  'toddler': 'Toddler',
  'pre-nursery': 'Pre-Nursery',
  'nursery': 'Nursery',
  'kg-1': 'KG-1',
};

const getClassName = (classId, classType = 'standard') => {
  if (classType === 'standard' && STANDARD_CLASSES[classId]) {
    return STANDARD_CLASSES[classId];
  }
  return classId || 'N/A';
};

const isValidClassId = (classId, classType = 'standard') => {
  if (classType === 'standard') {
    return STANDARD_CLASSES.hasOwnProperty(classId);
  }
  return true; // For custom classes, validation happens at database level
};

const getAllClasses = () => {
  return Object.entries(STANDARD_CLASSES).map(([id, name]) => ({
    id,
    name,
    type: 'standard'
  }));
};

module.exports = {
  STANDARD_CLASSES,
  getClassName,
  isValidClassId,
  getAllClasses,
};