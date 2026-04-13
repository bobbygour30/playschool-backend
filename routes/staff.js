const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// ==================== GET ALL STAFF ====================
router.get('/', async (req, res) => {
  try {
    const { role, status, department, search } = req.query;
    let query = {};
    
    // Apply filters
    if (role && role !== 'all') {
      query.role = role;
    }
    if (status && status !== 'all') {
      query.status = status;
    }
    if (department && department !== 'all') {
      query.department = department;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
      ];
    }
    
    const staff = await Staff.find(query)
      .populate('created_by', 'name email')
      .sort({ created_at: -1 });
    
    res.json(staff);
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET STAFF BY ID ====================
router.get('/:id', async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id)
      .populate('created_by', 'name email');
    
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }
    
    res.json(staff);
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET TEACHERS (for dropdown) ====================
router.get('/teachers/list', async (req, res) => {
  try {
    const teachers = await Staff.find({ 
      role: 'Teacher', 
      status: 'Active' 
    }).select('name designation email phone');
    
    res.json(teachers);
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET SUPPORT STAFF (for dropdown) ====================
router.get('/support-staff/list', async (req, res) => {
  try {
    const supportStaff = await Staff.find({ 
      role: 'Support Staff', 
      status: 'Active' 
    }).select('name designation email phone');
    
    res.json(supportStaff);
  } catch (error) {
    console.error('Error fetching support staff:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== CREATE STAFF ====================
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      date_of_birth,
      gender,
      blood_group,
      role,
      designation,
      department,
      assigned_class_id,
      date_of_joining,
      qualification,
      experience_years,
      specialization,
      salary,
      account_number,
      ifsc_code,
      bank_name,
      pan_number,
      uan_number,
      emergency_contact,
      police_verification,
      status,
      documents,
      notes,
      created_by,
    } = req.body;
    
    // Check if email already exists
    const existingStaff = await Staff.findOne({ email });
    if (existingStaff) {
      return res.status(400).json({ message: 'Staff member with this email already exists' });
    }
    
    // Upload documents to Cloudinary if provided
    const uploadedDocuments = {};
    
    if (documents) {
      if (documents.photo) {
        uploadedDocuments.photo = await uploadToCloudinary(documents.photo, 'staff/photos');
      }
      if (documents.resume) {
        uploadedDocuments.resume = await uploadToCloudinary(documents.resume, 'staff/resumes');
      }
      if (documents.qualification_doc) {
        uploadedDocuments.qualification_doc = await uploadToCloudinary(documents.qualification_doc, 'staff/qualifications');
      }
      if (documents.experience_doc) {
        uploadedDocuments.experience_doc = await uploadToCloudinary(documents.experience_doc, 'staff/experience');
      }
      if (documents.aadhar_doc) {
        uploadedDocuments.aadhar_doc = await uploadToCloudinary(documents.aadhar_doc, 'staff/aadhar');
      }
      if (documents.pan_doc) {
        uploadedDocuments.pan_doc = await uploadToCloudinary(documents.pan_doc, 'staff/pan');
      }
      if (documents.police_verification_doc) {
        uploadedDocuments.police_verification_doc = await uploadToCloudinary(documents.police_verification_doc, 'staff/police_verification');
      }
      if (documents.offer_letter) {
        uploadedDocuments.offer_letter = await uploadToCloudinary(documents.offer_letter, 'staff/offer_letters');
      }
    }
    
    const staffData = {
      name,
      email,
      phone,
      address,
      date_of_birth: new Date(date_of_birth),
      gender,
      blood_group: blood_group || '',
      role,
      designation,
      department,
      assigned_class_id: role === 'Teacher' ? (assigned_class_id || null) : null,
      date_of_joining: new Date(date_of_joining),
      qualification,
      experience_years: experience_years || 0,
      specialization: specialization || '',
      salary: parseFloat(salary),
      account_number: account_number || '',
      ifsc_code: ifsc_code || '',
      bank_name: bank_name || '',
      pan_number: pan_number || '',
      uan_number: uan_number || '',
      emergency_contact: {
        name: emergency_contact?.name || '',
        phone: emergency_contact?.phone || '',
        relation: emergency_contact?.relation || '',
      },
      police_verification: police_verification || '',
      status: status || 'Active',
      documents: uploadedDocuments,
      notes: notes || '',
      created_by: created_by || null,
    };
    
    const staff = new Staff(staffData);
    const savedStaff = await staff.save();
    
    const populatedStaff = await Staff.findById(savedStaff._id)
      .populate('created_by', 'name email');
    
    res.status(201).json(populatedStaff);
  } catch (error) {
    console.error('Error creating staff:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== UPDATE STAFF ====================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingStaff = await Staff.findById(id);
    
    if (!existingStaff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }
    
    const {
      name,
      email,
      phone,
      address,
      date_of_birth,
      gender,
      blood_group,
      role,
      designation,
      department,
      assigned_class_id,
      date_of_joining,
      qualification,
      experience_years,
      specialization,
      salary,
      account_number,
      ifsc_code,
      bank_name,
      pan_number,
      uan_number,
      emergency_contact,
      police_verification,
      status,
      documents,
      notes,
    } = req.body;
    
    // Check if email is being changed and already exists
    if (email !== existingStaff.email) {
      const existingEmail = await Staff.findOne({ email, _id: { $ne: id } });
      if (existingEmail) {
        return res.status(400).json({ message: 'Staff member with this email already exists' });
      }
    }
    
    // Handle document updates - delete old files from Cloudinary if replaced
    const updatedDocuments = { ...existingStaff.documents };
    
    if (documents) {
      // Photo
      if (documents.photo && documents.photo !== existingStaff.documents?.photo) {
        if (existingStaff.documents?.photo) {
          await deleteFromCloudinary(existingStaff.documents.photo);
        }
        updatedDocuments.photo = await uploadToCloudinary(documents.photo, 'staff/photos');
      }
      
      // Resume
      if (documents.resume && documents.resume !== existingStaff.documents?.resume) {
        if (existingStaff.documents?.resume) {
          await deleteFromCloudinary(existingStaff.documents.resume);
        }
        updatedDocuments.resume = await uploadToCloudinary(documents.resume, 'staff/resumes');
      }
      
      // Qualification Document
      if (documents.qualification_doc && documents.qualification_doc !== existingStaff.documents?.qualification_doc) {
        if (existingStaff.documents?.qualification_doc) {
          await deleteFromCloudinary(existingStaff.documents.qualification_doc);
        }
        updatedDocuments.qualification_doc = await uploadToCloudinary(documents.qualification_doc, 'staff/qualifications');
      }
      
      // Experience Document
      if (documents.experience_doc && documents.experience_doc !== existingStaff.documents?.experience_doc) {
        if (existingStaff.documents?.experience_doc) {
          await deleteFromCloudinary(existingStaff.documents.experience_doc);
        }
        updatedDocuments.experience_doc = await uploadToCloudinary(documents.experience_doc, 'staff/experience');
      }
      
      // Aadhar Document
      if (documents.aadhar_doc && documents.aadhar_doc !== existingStaff.documents?.aadhar_doc) {
        if (existingStaff.documents?.aadhar_doc) {
          await deleteFromCloudinary(existingStaff.documents.aadhar_doc);
        }
        updatedDocuments.aadhar_doc = await uploadToCloudinary(documents.aadhar_doc, 'staff/aadhar');
      }
      
      // PAN Document
      if (documents.pan_doc && documents.pan_doc !== existingStaff.documents?.pan_doc) {
        if (existingStaff.documents?.pan_doc) {
          await deleteFromCloudinary(existingStaff.documents.pan_doc);
        }
        updatedDocuments.pan_doc = await uploadToCloudinary(documents.pan_doc, 'staff/pan');
      }
      
      // Police Verification Document
      if (documents.police_verification_doc && documents.police_verification_doc !== existingStaff.documents?.police_verification_doc) {
        if (existingStaff.documents?.police_verification_doc) {
          await deleteFromCloudinary(existingStaff.documents.police_verification_doc);
        }
        updatedDocuments.police_verification_doc = await uploadToCloudinary(documents.police_verification_doc, 'staff/police_verification');
      }
      
      // Offer Letter
      if (documents.offer_letter && documents.offer_letter !== existingStaff.documents?.offer_letter) {
        if (existingStaff.documents?.offer_letter) {
          await deleteFromCloudinary(existingStaff.documents.offer_letter);
        }
        updatedDocuments.offer_letter = await uploadToCloudinary(documents.offer_letter, 'staff/offer_letters');
      }
    }
    
    const staffData = {
      name,
      email,
      phone,
      address,
      date_of_birth: new Date(date_of_birth),
      gender,
      blood_group: blood_group || '',
      role,
      designation,
      department,
      assigned_class_id: role === 'Teacher' ? (assigned_class_id || null) : null,
      date_of_joining: new Date(date_of_joining),
      qualification,
      experience_years: experience_years || 0,
      specialization: specialization || '',
      salary: parseFloat(salary),
      account_number: account_number || '',
      ifsc_code: ifsc_code || '',
      bank_name: bank_name || '',
      pan_number: pan_number || '',
      uan_number: uan_number || '',
      emergency_contact: {
        name: emergency_contact?.name || '',
        phone: emergency_contact?.phone || '',
        relation: emergency_contact?.relation || '',
      },
      police_verification: police_verification || '',
      status,
      documents: updatedDocuments,
      notes: notes || '',
      updated_at: Date.now(),
    };
    
    const staff = await Staff.findByIdAndUpdate(
      id,
      staffData,
      { new: true, runValidators: true }
    ).populate('created_by', 'name email');
    
    res.json(staff);
  } catch (error) {
    console.error('Error updating staff:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== DELETE STAFF ====================
router.delete('/:id', async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }
    
    // Delete all associated documents from Cloudinary
    if (staff.documents) {
      const docFields = [
        'photo',
        'resume',
        'qualification_doc',
        'experience_doc',
        'aadhar_doc',
        'pan_doc',
        'police_verification_doc',
        'offer_letter'
      ];
      
      for (const field of docFields) {
        if (staff.documents[field]) {
          await deleteFromCloudinary(staff.documents[field]);
        }
      }
    }
    
    await Staff.findByIdAndDelete(req.params.id);
    res.json({ message: 'Staff member deleted successfully' });
  } catch (error) {
    console.error('Error deleting staff:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== UPDATE STAFF STATUS ====================
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['Active', 'Inactive', 'On Leave', 'Suspended'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const staff = await Staff.findByIdAndUpdate(
      id,
      { status, updated_at: Date.now() },
      { new: true }
    ).populate('created_by', 'name email');
    
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }
    
    res.json(staff);
  } catch (error) {
    console.error('Error updating staff status:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET STAFF STATISTICS ====================
router.get('/stats/overview', async (req, res) => {
  try {
    const totalStaff = await Staff.countDocuments();
    const activeStaff = await Staff.countDocuments({ status: 'Active' });
    const onLeave = await Staff.countDocuments({ status: 'On Leave' });
    const inactive = await Staff.countDocuments({ status: 'Inactive' });
    
    const teachers = await Staff.countDocuments({ role: 'Teacher' });
    const supportStaff = await Staff.countDocuments({ role: 'Support Staff' });
    const administrators = await Staff.countDocuments({ role: 'Administrator' });
    
    const totalSalary = await Staff.aggregate([
      { $group: { _id: null, total: { $sum: '$salary' } } }
    ]);
    
    const departmentStats = await Staff.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 } } }
    ]);
    
    res.json({
      total: totalStaff,
      active: activeStaff,
      onLeave,
      inactive,
      teachers,
      supportStaff,
      administrators,
      totalSalary: totalSalary[0]?.total || 0,
      departmentStats,
    });
  } catch (error) {
    console.error('Error fetching staff statistics:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET STAFF BY DEPARTMENT ====================
router.get('/department/:department', async (req, res) => {
  try {
    const { department } = req.params;
    const staff = await Staff.find({ department, status: 'Active' })
      .select('name designation email phone')
      .sort({ name: 1 });
    
    res.json(staff);
  } catch (error) {
    console.error('Error fetching staff by department:', error);
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
    
    let folder = 'staff';
    switch (documentType) {
      case 'photo': folder = 'staff/photos'; break;
      case 'resume': folder = 'staff/resumes'; break;
      case 'qualification': folder = 'staff/qualifications'; break;
      case 'experience': folder = 'staff/experience'; break;
      case 'aadhar': folder = 'staff/aadhar'; break;
      case 'pan': folder = 'staff/pan'; break;
      case 'police': folder = 'staff/police_verification'; break;
      case 'offer': folder = 'staff/offer_letters'; break;
      default: folder = 'staff';
    }
    
    const uploadedUrl = await uploadToCloudinary(document, folder);
    
    res.json({ url: uploadedUrl });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET BIRTHDAYS THIS MONTH ====================
router.get('/birthdays/upcoming', async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentDay = currentDate.getDate();
    
    const staff = await Staff.find({
      status: 'Active',
      $expr: {
        $and: [
          { $eq: [{ $month: '$date_of_birth' }, currentMonth + 1] },
          { $gte: [{ $dayOfMonth: '$date_of_birth' }, currentDay] }
        ]
      }
    }).select('name date_of_birth designation');
    
    // Sort by day of month
    staff.sort((a, b) => {
      const dayA = new Date(a.date_of_birth).getDate();
      const dayB = new Date(b.date_of_birth).getDate();
      return dayA - dayB;
    });
    
    res.json(staff);
  } catch (error) {
    console.error('Error fetching birthdays:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;