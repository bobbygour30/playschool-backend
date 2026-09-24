const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const {
  validateTeacherAssignment,
  normalizeAssignments,
  syncStudentsForTeacher,
  syncFacultyFromStaff,
} = require('../utils/staffFacultySync');

// document field -> cloudinary folder
const DOC_FOLDERS = {
  photo: 'staff/photos',
  resume: 'staff/resumes',
  qualification_doc: 'staff/qualifications',
  experience_doc: 'staff/experience',
  aadhar_doc: 'staff/aadhar',
  pan_doc: 'staff/pan',
  police_verification_doc: 'staff/police_verification',
  offer_letter: 'staff/offer_letters',
};

// Fields shared by create + update
const buildStaffFields = (b) => {
  const isTeacher = b.role === 'Teacher';
  return {
    name: b.name,
    email: b.email,
    phone: b.phone,
    address: b.address,
    date_of_birth: new Date(b.date_of_birth),
    gender: b.gender,
    blood_group: b.blood_group || '',
    role: b.role,
    designation: b.designation,
    department: b.department,
    assignments: isTeacher ? normalizeAssignments(b.assignments) : [],
    date_of_joining: new Date(b.date_of_joining),
    qualification: b.qualification,
    experience_years: b.experience_years || 0,
    specialization: b.specialization || '',
    salary: parseFloat(b.salary),
    account_number: b.account_number || '',
    ifsc_code: b.ifsc_code || '',
    bank_name: b.bank_name || '',
    pan_number: b.pan_number || '',
    uan_number: b.uan_number || '',
    emergency_contact: {
      name: b.emergency_contact?.name || '',
      phone: b.emergency_contact?.phone || '',
      relation: b.emergency_contact?.relation || '',
    },
    police_verification: b.police_verification || '',
    notes: b.notes || '',
  };
};

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
    const teachers = await Staff.find({ role: 'Teacher', status: 'Active' })
      .select('name designation email phone assignments');
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
    const { email, role, assignments, status, documents, created_by } = req.body;

    const existingStaff = await Staff.findOne({ email });
    if (existingStaff) {
      return res.status(400).json({ message: 'Staff member with this email already exists' });
    }

    // Teacher needs >= 1 valid class+section, each held by no other teacher
    const assignmentError = await validateTeacherAssignment({ role, assignments });
    if (assignmentError) {
      return res.status(400).json({ message: assignmentError });
    }

    const uploadedDocuments = {};
    for (const [field, folder] of Object.entries(DOC_FOLDERS)) {
      if (documents?.[field]) {
        uploadedDocuments[field] = await uploadToCloudinary(documents[field], folder);
      }
    }

    const staff = new Staff({
      ...buildStaffFields(req.body),
      status: status || 'Active',
      documents: uploadedDocuments,
      created_by: created_by || null,
    });
    const savedStaff = await staff.save();

    // Link existing students of every assigned class + section to this teacher
    await syncStudentsForTeacher(savedStaff);

    const populatedStaff = await Staff.findById(savedStaff._id).populate('created_by', 'name email');
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

    const { email, role, assignments, status, documents } = req.body;

    if (email !== existingStaff.email) {
      const existingEmail = await Staff.findOne({ email, _id: { $ne: id } });
      if (existingEmail) {
        return res.status(400).json({ message: 'Staff member with this email already exists' });
      }
    }

    // Can't stop being a Teacher while a faculty account exists for this person
    if (role !== 'Teacher' && existingStaff.role === 'Teacher') {
      const linkedFaculty = await Faculty.findOne({ staff_id: id });
      if (linkedFaculty) {
        return res.status(400).json({
          message: 'This staff member has a faculty account. Delete the faculty account before changing the role.',
        });
      }
    }

    const assignmentError = await validateTeacherAssignment({ role, assignments }, id);
    if (assignmentError) {
      return res.status(400).json({ message: assignmentError });
    }

    const updatedDocuments = { ...existingStaff.documents };
    if (documents) {
      for (const [field, folder] of Object.entries(DOC_FOLDERS)) {
        const incoming = documents[field];
        const current = existingStaff.documents?.[field];
        if (incoming && incoming !== current) {
          if (current) await deleteFromCloudinary(current);
          updatedDocuments[field] = await uploadToCloudinary(incoming, folder);
        }
      }
    }

    const staff = await Staff.findByIdAndUpdate(
      id,
      {
        ...buildStaffFields(req.body),
        status,
        documents: updatedDocuments,
        updated_at: Date.now(),
      },
      { new: true, runValidators: true }
    ).populate('created_by', 'name email');

    // Keep everything downstream connected
    await syncStudentsForTeacher(staff);   // removed slots release students, new slots pick them up
    await syncFacultyFromStaff(staff);     // faculty account mirrors name/assignments/status

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

    // Block deletion while a faculty account depends on this staff member
    const linkedFaculty = await Faculty.findOne({ staff_id: staff._id });
    if (linkedFaculty) {
      return res.status(400).json({
        message: 'This staff member has a faculty account. Delete the faculty account first.',
      });
    }

    if (staff.documents) {
      for (const field of Object.keys(DOC_FOLDERS)) {
        if (staff.documents[field]) {
          await deleteFromCloudinary(staff.documents[field]);
        }
      }
    }

    // Students of this teacher become "unassigned"
    await Student.updateMany({ assigned_teacher_id: staff._id }, { $set: { assigned_teacher_id: null } });

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

    await syncStudentsForTeacher(staff);
    await syncFacultyFromStaff(staff);

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