// Standard classes mapping
const STANDARD_CLASSES = {
  '1': '1st Standard',
  '2': '2nd Standard',
  '3': '3rd Standard',
  '4': '4th Standard',
  '5': '5th Standard',
  '6': '6th Standard',
  '7': '7th Standard',
  '8': '8th Standard',
  '9': '9th Standard',
  '10': '10th Standard',
  '11': '11th Standard',
  '12': '12th Standard',
};

const getClassName = (classId, classType = 'standard') => {
  if (classType === 'standard' && STANDARD_CLASSES[classId]) {
    return STANDARD_CLASSES[classId];
  }
  return null;
};

const isValidClassId = (classId, classType = 'standard') => {
  if (classType === 'standard') {
    return STANDARD_CLASSES.hasOwnProperty(classId);
  }
  return true; // For custom classes, validation happens at database level
};

module.exports = {
  STANDARD_CLASSES,
  getClassName,
  isValidClassId,
};