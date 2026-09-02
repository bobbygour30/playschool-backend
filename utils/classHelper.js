// utils/classHelper.js

// Standard classes mapping for PlaySchool
const STANDARD_CLASSES = {
  'toddler': 'Toddler',
  'pre-nursery': 'Pre-Nursery',
  'nursery': 'Nursery',
  'kg-1': 'KG-1',
};

// Class age ranges
const CLASS_AGE_RANGES = {
  'toddler': '1.5 - 2.5 years',
  'pre-nursery': '2.5 - 3.5 years',
  'nursery': '3.5 - 4.5 years',
  'kg-1': '4.5 - 5.5 years',
};

// Class sections
const CLASS_SECTIONS = ['A', 'B', 'C', 'D'];

// Blood groups
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Payment modes
const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'];

// Fee structure constants
const FEE_STRUCTURE = {
  registration: { 
    amount: 1000, 
    type: 'one-time', 
    label: 'Registration Fee',
    description: 'One time registration fee'
  },
  admission: { 
    amount: 5000, 
    type: 'one-time', 
    label: 'Admission Fee',
    description: 'One time admission charges'
  },
  tuition: { 
    amount: 5000, 
    type: 'monthly', 
    label: 'Tuition Fee',
    description: 'Monthly tuition fees'
  },
  activity: { 
    amount: 5000, 
    type: 'annual', 
    label: 'Activity Fee',
    description: 'Annual activity charges'
  },
  kit: { 
    amount: 5500, 
    type: 'annual', 
    label: 'Kit Fee',
    description: 'Annual kit charges'
  },
  cab: { 
    amount: 1000, 
    type: 'monthly', 
    label: 'Cab Fee',
    description: 'Monthly cab charges (optional)'
  },
  camera: { 
    amount: 1000, 
    type: 'monthly', 
    label: 'Camera Fee',
    description: 'Monthly camera charges (optional)'
  }
};

// Get all fee types with their details
const getAllFeeTypes = () => {
  return Object.entries(FEE_STRUCTURE).map(([key, value]) => ({
    key,
    ...value
  }));
};

// Get total fee breakdown
const getTotalFeeBreakdown = (fees = {}) => {
  const breakdown = {};
  let total = 0;
  
  Object.keys(FEE_STRUCTURE).forEach(key => {
    const amount = parseFloat(fees[key]) || 0;
    breakdown[key] = amount;
    total += amount;
  });
  
  return {
    breakdown,
    total
  };
};

// Get class name
const getClassName = (classId, classType = 'standard') => {
  if (classType === 'standard' && STANDARD_CLASSES[classId]) {
    return STANDARD_CLASSES[classId];
  }
  return classId || 'N/A';
};

// Validate class ID
const isValidClassId = (classId, classType = 'standard') => {
  if (classType === 'standard') {
    return STANDARD_CLASSES.hasOwnProperty(classId);
  }
  return true; // For custom classes, validation happens at database level
};

// Get all classes
const getAllClasses = () => {
  return Object.entries(STANDARD_CLASSES).map(([id, name]) => ({
    id,
    name,
    type: 'standard'
  }));
};

// Get class by ID
const getClassById = (classId) => {
  if (STANDARD_CLASSES[classId]) {
    return {
      id: classId,
      name: STANDARD_CLASSES[classId],
      ageRange: CLASS_AGE_RANGES[classId] || 'N/A',
      type: 'standard'
    };
  }
  return null;
};

// Get all classes with age ranges
const getClassesWithAgeRanges = () => {
  return Object.entries(STANDARD_CLASSES).map(([id, name]) => ({
    id,
    name,
    ageRange: CLASS_AGE_RANGES[id] || 'N/A',
    type: 'standard'
  }));
};

// Validate blood group
const isValidBloodGroup = (bloodGroup) => {
  return BLOOD_GROUPS.includes(bloodGroup);
};

// Validate section
const isValidSection = (section) => {
  return CLASS_SECTIONS.includes(section.toUpperCase());
};

// Validate payment mode
const isValidPaymentMode = (paymentMode) => {
  return PAYMENT_MODES.includes(paymentMode);
};

// Calculate total fee from individual components
const calculateTotalFee = (fees) => {
  const reg = parseFloat(fees.registration_fee) || 0;
  const adm = parseFloat(fees.admission_fee) || 0;
  const tui = parseFloat(fees.tuition_fee) || 0;
  const act = parseFloat(fees.activity_fee) || 0;
  const kit = parseFloat(fees.kit_fee) || 0;
  const cab = parseFloat(fees.cab_fee) || 0;
  const cam = parseFloat(fees.camera_fee) || 0;
  return reg + adm + tui + act + kit + cab + cam;
};

// Get fee summary with labels
const getFeeSummary = (fees = {}) => {
  const summary = [];
  let total = 0;
  
  Object.entries(FEE_STRUCTURE).forEach(([key, config]) => {
    const amount = parseFloat(fees[`${key}_fee`]) || 0;
    if (amount > 0) {
      summary.push({
        key,
        label: config.label,
        type: config.type,
        amount,
        description: config.description
      });
      total += amount;
    }
  });
  
  return {
    items: summary,
    total
  };
};

module.exports = {
  STANDARD_CLASSES,
  CLASS_AGE_RANGES,
  CLASS_SECTIONS,
  BLOOD_GROUPS,
  PAYMENT_MODES,
  FEE_STRUCTURE,
  getClassName,
  isValidClassId,
  getAllClasses,
  getClassById,
  getClassesWithAgeRanges,
  isValidBloodGroup,
  isValidSection,
  isValidPaymentMode,
  calculateTotalFee,
  getFeeSummary,
  getTotalFeeBreakdown,
  getAllFeeTypes
};