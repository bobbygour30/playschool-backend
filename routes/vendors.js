const express = require('express');
const router = express.Router();
const Vendor = require('../models/Vendor');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// ==================== GET ALL VENDORS ====================
router.get('/', async (req, res) => {
  try {
    const { type, status, search } = req.query;
    let query = {};
    
    // Apply filters
    if (type && type !== 'all') {
      query.vendor_type = type;
    }
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { vendor_name: { $regex: search, $options: 'i' } },
        { contact_person: { $regex: search, $options: 'i' } },
        { vehicle_number: { $regex: search, $options: 'i' } },
        { contact_phone: { $regex: search, $options: 'i' } },
      ];
    }
    
    const vendors = await Vendor.find(query)
      .populate('created_by', 'name email')
      .sort({ created_at: -1 });
    
    res.json(vendors);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET VENDOR BY ID ====================
router.get('/:id', async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id)
      .populate('created_by', 'name email');
    
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    
    res.json(vendor);
  } catch (error) {
    console.error('Error fetching vendor:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== CREATE VENDOR ====================
router.post('/', async (req, res) => {
  try {
    const {
      vendor_name,
      vendor_type,
      address,
      contact_person,
      contact_phone,
      contact_email,
      driving_license,
      police_verification,
      gst_number,
      pan_number,
      vehicle_number,
      vehicle_type,
      route_details,
      contract_start_date,
      contract_end_date,
      payment_terms,
      status,
      documents,
      notes,
      created_by,
    } = req.body;
    
    // Upload documents to Cloudinary if provided
    const uploadedDocuments = {};
    
    if (documents) {
      if (documents.license_doc) {
        uploadedDocuments.license_doc = await uploadToCloudinary(
          documents.license_doc,
          'vendors/licenses'
        );
      }
      if (documents.police_verification_doc) {
        uploadedDocuments.police_verification_doc = await uploadToCloudinary(
          documents.police_verification_doc,
          'vendors/police_verification'
        );
      }
      if (documents.vehicle_registration_doc) {
        uploadedDocuments.vehicle_registration_doc = await uploadToCloudinary(
          documents.vehicle_registration_doc,
          'vendors/vehicle_registration'
        );
      }
      if (documents.insurance_doc) {
        uploadedDocuments.insurance_doc = await uploadToCloudinary(
          documents.insurance_doc,
          'vendors/insurance'
        );
      }
      if (documents.gst_doc) {
        uploadedDocuments.gst_doc = await uploadToCloudinary(
          documents.gst_doc,
          'vendors/gst'
        );
      }
      if (documents.pan_doc) {
        uploadedDocuments.pan_doc = await uploadToCloudinary(
          documents.pan_doc,
          'vendors/pan'
        );
      }
      if (documents.agreement_doc) {
        uploadedDocuments.agreement_doc = await uploadToCloudinary(
          documents.agreement_doc,
          'vendors/agreements'
        );
      }
    }
    
    const vendorData = {
      vendor_name,
      vendor_type: vendor_type || 'Bus',
      address,
      contact_person,
      contact_phone,
      contact_email,
      driving_license: driving_license || '',
      police_verification: police_verification || '',
      gst_number: gst_number || '',
      pan_number: pan_number || '',
      vehicle_number: vehicle_number || '',
      vehicle_type: vehicle_type || 'Bus',
      route_details: route_details || '',
      contract_start_date: new Date(contract_start_date),
      contract_end_date: contract_end_date ? new Date(contract_end_date) : null,
      payment_terms: payment_terms || '',
      status: status || 'Pending',
      documents: uploadedDocuments,
      notes: notes || '',
      created_by: created_by || null,
    };
    
    const vendor = new Vendor(vendorData);
    const savedVendor = await vendor.save();
    
    const populatedVendor = await Vendor.findById(savedVendor._id)
      .populate('created_by', 'name email');
    
    res.status(201).json(populatedVendor);
  } catch (error) {
    console.error('Error creating vendor:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== UPDATE VENDOR ====================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingVendor = await Vendor.findById(id);
    
    if (!existingVendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    
    const {
      vendor_name,
      vendor_type,
      address,
      contact_person,
      contact_phone,
      contact_email,
      driving_license,
      police_verification,
      gst_number,
      pan_number,
      vehicle_number,
      vehicle_type,
      route_details,
      contract_start_date,
      contract_end_date,
      payment_terms,
      status,
      documents,
      notes,
    } = req.body;
    
    // Handle document updates - delete old files from Cloudinary if replaced
    const updatedDocuments = { ...existingVendor.documents };
    
    if (documents) {
      // License Document
      if (documents.license_doc && documents.license_doc !== existingVendor.documents?.license_doc) {
        if (existingVendor.documents?.license_doc) {
          await deleteFromCloudinary(existingVendor.documents.license_doc);
        }
        updatedDocuments.license_doc = await uploadToCloudinary(documents.license_doc, 'vendors/licenses');
      }
      
      // Police Verification Document
      if (documents.police_verification_doc && documents.police_verification_doc !== existingVendor.documents?.police_verification_doc) {
        if (existingVendor.documents?.police_verification_doc) {
          await deleteFromCloudinary(existingVendor.documents.police_verification_doc);
        }
        updatedDocuments.police_verification_doc = await uploadToCloudinary(documents.police_verification_doc, 'vendors/police_verification');
      }
      
      // Vehicle Registration Document
      if (documents.vehicle_registration_doc && documents.vehicle_registration_doc !== existingVendor.documents?.vehicle_registration_doc) {
        if (existingVendor.documents?.vehicle_registration_doc) {
          await deleteFromCloudinary(existingVendor.documents.vehicle_registration_doc);
        }
        updatedDocuments.vehicle_registration_doc = await uploadToCloudinary(documents.vehicle_registration_doc, 'vendors/vehicle_registration');
      }
      
      // Insurance Document
      if (documents.insurance_doc && documents.insurance_doc !== existingVendor.documents?.insurance_doc) {
        if (existingVendor.documents?.insurance_doc) {
          await deleteFromCloudinary(existingVendor.documents.insurance_doc);
        }
        updatedDocuments.insurance_doc = await uploadToCloudinary(documents.insurance_doc, 'vendors/insurance');
      }
      
      // GST Document
      if (documents.gst_doc && documents.gst_doc !== existingVendor.documents?.gst_doc) {
        if (existingVendor.documents?.gst_doc) {
          await deleteFromCloudinary(existingVendor.documents.gst_doc);
        }
        updatedDocuments.gst_doc = await uploadToCloudinary(documents.gst_doc, 'vendors/gst');
      }
      
      // PAN Document
      if (documents.pan_doc && documents.pan_doc !== existingVendor.documents?.pan_doc) {
        if (existingVendor.documents?.pan_doc) {
          await deleteFromCloudinary(existingVendor.documents.pan_doc);
        }
        updatedDocuments.pan_doc = await uploadToCloudinary(documents.pan_doc, 'vendors/pan');
      }
      
      // Agreement Document
      if (documents.agreement_doc && documents.agreement_doc !== existingVendor.documents?.agreement_doc) {
        if (existingVendor.documents?.agreement_doc) {
          await deleteFromCloudinary(existingVendor.documents.agreement_doc);
        }
        updatedDocuments.agreement_doc = await uploadToCloudinary(documents.agreement_doc, 'vendors/agreements');
      }
    }
    
    const vendorData = {
      vendor_name,
      vendor_type,
      address,
      contact_person,
      contact_phone,
      contact_email,
      driving_license: driving_license || '',
      police_verification: police_verification || '',
      gst_number: gst_number || '',
      pan_number: pan_number || '',
      vehicle_number: vehicle_number || '',
      vehicle_type: vehicle_type || 'Bus',
      route_details: route_details || '',
      contract_start_date: new Date(contract_start_date),
      contract_end_date: contract_end_date ? new Date(contract_end_date) : null,
      payment_terms: payment_terms || '',
      status,
      documents: updatedDocuments,
      notes: notes || '',
      updated_at: Date.now(),
    };
    
    const vendor = await Vendor.findByIdAndUpdate(
      id,
      vendorData,
      { new: true, runValidators: true }
    ).populate('created_by', 'name email');
    
    res.json(vendor);
  } catch (error) {
    console.error('Error updating vendor:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== DELETE VENDOR ====================
router.delete('/:id', async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    
    // Delete all associated documents from Cloudinary
    if (vendor.documents) {
      const docFields = [
        'license_doc',
        'police_verification_doc',
        'vehicle_registration_doc',
        'insurance_doc',
        'gst_doc',
        'pan_doc',
        'agreement_doc'
      ];
      
      for (const field of docFields) {
        if (vendor.documents[field]) {
          await deleteFromCloudinary(vendor.documents[field]);
        }
      }
    }
    
    await Vendor.findByIdAndDelete(req.params.id);
    res.json({ message: 'Vendor deleted successfully' });
  } catch (error) {
    console.error('Error deleting vendor:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET VENDORS BY TYPE ====================
router.get('/type/:vendorType', async (req, res) => {
  try {
    const { vendorType } = req.params;
    const vendors = await Vendor.find({ vendor_type: vendorType, status: 'Active' })
      .select('vendor_name contact_person contact_phone vehicle_number')
      .sort({ vendor_name: 1 });
    
    res.json(vendors);
  } catch (error) {
    console.error('Error fetching vendors by type:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET CONTRACT EXPIRING SOON ====================
router.get('/contracts/expiring', async (req, res) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const expiringVendors = await Vendor.find({
      contract_end_date: { $lte: thirtyDaysFromNow, $ne: null },
      status: 'Active'
    }).sort({ contract_end_date: 1 });
    
    res.json(expiringVendors);
  } catch (error) {
    console.error('Error fetching expiring contracts:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== UPDATE VENDOR STATUS ====================
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['Active', 'Inactive', 'Pending', 'Suspended'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const vendor = await Vendor.findByIdAndUpdate(
      id,
      { status, updated_at: Date.now() },
      { new: true }
    ).populate('created_by', 'name email');
    
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    
    res.json(vendor);
  } catch (error) {
    console.error('Error updating vendor status:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET VENDOR STATISTICS ====================
router.get('/stats/overview', async (req, res) => {
  try {
    const totalVendors = await Vendor.countDocuments();
    const activeVendors = await Vendor.countDocuments({ status: 'Active' });
    const inactiveVendors = await Vendor.countDocuments({ status: 'Inactive' });
    const pendingVendors = await Vendor.countDocuments({ status: 'Pending' });
    
    const busVendors = await Vendor.countDocuments({ vendor_type: 'Bus' });
    const vanVendors = await Vendor.countDocuments({ vendor_type: 'Van' });
    
    // Get vendors with expiring contracts in next 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringContracts = await Vendor.countDocuments({
      contract_end_date: { $lte: thirtyDaysFromNow, $ne: null },
      status: 'Active'
    });
    
    res.json({
      total: totalVendors,
      active: activeVendors,
      inactive: inactiveVendors,
      pending: pendingVendors,
      busVendors,
      vanVendors,
      expiringContracts,
    });
  } catch (error) {
    console.error('Error fetching vendor statistics:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== UPLOAD DOCUMENT (Single endpoint) ====================
router.post('/upload-document', async (req, res) => {
  try {
    const { document, documentType } = req.body;
    
    if (!document) {
      return res.status(400).json({ message: 'No document provided' });
    }
    
    let folder = 'vendors';
    switch (documentType) {
      case 'license': folder = 'vendors/licenses'; break;
      case 'police': folder = 'vendors/police_verification'; break;
      case 'registration': folder = 'vendors/vehicle_registration'; break;
      case 'insurance': folder = 'vendors/insurance'; break;
      case 'gst': folder = 'vendors/gst'; break;
      case 'pan': folder = 'vendors/pan'; break;
      case 'agreement': folder = 'vendors/agreements'; break;
      default: folder = 'vendors';
    }
    
    const uploadedUrl = await uploadToCloudinary(document, folder);
    
    res.json({ url: uploadedUrl });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;