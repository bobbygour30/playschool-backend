const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  // Basic Information
  vendor_name: {
    type: String,
    required: true,
    trim: true,
  },
  vendor_type: {
    type: String,
    required: true,
    enum: ['Bus', 'Van', 'Catering', 'Stationery', 'Other'],
    default: 'Bus',
  },
  address: {
    type: String,
    required: true,
  },
  
  // Contact Information
  contact_person: {
    type: String,
    required: true,
  },
  contact_phone: {
    type: String,
    required: true,
  },
  contact_email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  
  // Legal Documents
  driving_license: {
    type: String,
    default: '',
  },
  police_verification: {
    type: String,
    default: '',
  },
  gst_number: {
    type: String,
    default: '',
  },
  pan_number: {
    type: String,
    default: '',
  },
  
  // Vehicle Details (for transport vendors)
  vehicle_number: {
    type: String,
    default: '',
  },
  vehicle_type: {
    type: String,
    enum: ['Bus', 'Van', 'Car', 'Truck', 'Other'],
    default: 'Bus',
  },
  route_details: {
    type: String,
    default: '',
  },
  
  // Contract Details
  contract_start_date: {
    type: Date,
    required: true,
  },
  contract_end_date: {
    type: Date,
    default: null,
  },
  payment_terms: {
    type: String,
    default: '',
  },
  
  // Status
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Pending', 'Suspended'],
    default: 'Pending',
  },
  
  // Documents Storage (Cloudinary URLs)
  documents: {
    license_doc: {
      type: String,
      default: null,
    },
    police_verification_doc: {
      type: String,
      default: null,
    },
    vehicle_registration_doc: {
      type: String,
      default: null,
    },
    insurance_doc: {
      type: String,
      default: null,
    },
    gst_doc: {
      type: String,
      default: null,
    },
    pan_doc: {
      type: String,
      default: null,
    },
    agreement_doc: {
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
vendorSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Index for faster searches
vendorSchema.index({ vendor_name: 'text', contact_person: 'text', vehicle_number: 'text' });

module.exports = mongoose.model('Vendor', vendorSchema);