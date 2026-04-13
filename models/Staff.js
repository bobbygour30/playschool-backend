const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  // Personal Information
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  date_of_birth: {
    type: Date,
    required: true,
  },
  gender: {
    type: String,
    required: true,
    enum: ['Male', 'Female', 'Other'],
  },
  blood_group: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', ''],
    default: '',
  },
  
  // Professional Information
  role: {
    type: String,
    required: true,
    enum: ['Teacher', 'Support Staff', 'Administrator'],
  },
  designation: {
    type: String,
    required: true,
  },
  department: {
    type: String,
    required: true,
    enum: ['Academics', 'Administration', 'Transport', 'Security', 'Housekeeping', 'Kitchen'],
  },
  assigned_class_id: {
    type: String,
    default: null,
  },
  date_of_joining: {
    type: Date,
    required: true,
  },
  qualification: {
    type: String,
    required: true,
  },
  experience_years: {
    type: Number,
    default: 0,
  },
  specialization: {
    type: String,
    default: '',
  },
  
  // Salary & Banking Information
  salary: {
    type: Number,
    required: true,
  },
  account_number: {
    type: String,
    default: '',
  },
  ifsc_code: {
    type: String,
    default: '',
  },
  bank_name: {
    type: String,
    default: '',
  },
  pan_number: {
    type: String,
    default: '',
  },
  uan_number: {
    type: String,
    default: '',
  },
  
  // Emergency Contact
  emergency_contact: {
    name: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      default: '',
    },
    relation: {
      type: String,
      default: '',
    },
  },
  
  // Legal Documents
  police_verification: {
    type: String,
    default: '',
  },
  
  // Status
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'On Leave', 'Suspended'],
    default: 'Active',
  },
  
  // Documents Storage (Cloudinary URLs)
  documents: {
    photo: {
      type: String,
      default: null,
    },
    resume: {
      type: String,
      default: null,
    },
    qualification_doc: {
      type: String,
      default: null,
    },
    experience_doc: {
      type: String,
      default: null,
    },
    aadhar_doc: {
      type: String,
      default: null,
    },
    pan_doc: {
      type: String,
      default: null,
    },
    police_verification_doc: {
      type: String,
      default: null,
    },
    offer_letter: {
      type: String,
      default: null,
    },
  },
  
  // Additional Information
  notes: {
    type: String,
    default: '',
  },
  
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Update timestamp on save
staffSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Index for faster searches
staffSchema.index({ 
  name: 'text', 
  email: 'text', 
  phone: 'text', 
  designation: 'text' 
});

module.exports = mongoose.model('Staff', staffSchema);