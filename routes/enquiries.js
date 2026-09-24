// routes/enquiries.js
const express = require('express');
const router = express.Router();
const Enquiry = require('../models/Enquiry');
const Student = require('../models/Student');

const {
  FOLLOW_UP_STATUSES,
  KNOWLEDGE_SOURCES,
} = Enquiry;

// ---------- Helpers ----------

const sanitizePhone = (v) => (v ? String(v).replace(/\D/g, '').slice(0, 10) : '');

const buildEnquiryPayload = (body, { isUpdate = false } = {}) => {
  const payload = {};

  const assignIf = (key, val) => {
    if (val !== undefined) payload[key] = val;
  };

  assignIf('student_name', body.student_name?.trim());
  assignIf('student_dob', body.student_dob ? new Date(body.student_dob) : null);
  assignIf('student_gender', body.student_gender || '');
  assignIf('class_interested', body.class_interested || '');

  assignIf('parent_name', body.parent_name?.trim());
  assignIf('parent_relationship', body.parent_relationship || 'Father');
  assignIf('parent_phone', sanitizePhone(body.parent_phone));
  assignIf('parent_email', body.parent_email?.trim().toLowerCase());
  assignIf('address', body.address?.trim());

  assignIf('enquiry_date', body.enquiry_date ? new Date(body.enquiry_date) : undefined);
  assignIf('first_visit_date', body.first_visit_date ? new Date(body.first_visit_date) : undefined);

  assignIf('knowledge_source', body.knowledge_source);
  assignIf('knowledge_source_other', body.knowledge_source_other?.trim() || '');

  assignIf('status', body.status);
  assignIf('last_follow_up_date', body.last_follow_up_date ? new Date(body.last_follow_up_date) : null);
  assignIf('next_follow_up_date', body.next_follow_up_date ? new Date(body.next_follow_up_date) : null);

  assignIf('notes', body.notes?.trim() || '');

  if (!isUpdate) {
    // On create, give sensible defaults so required fields never end up undefined
    if (payload.enquiry_date === undefined) payload.enquiry_date = new Date();
    if (payload.first_visit_date === undefined) payload.first_visit_date = new Date();
  }

  return payload;
};

// ==================== STATIC / META ROUTES (must come before /:id) ====================

// Return allowed enums so the frontend dropdowns stay in sync
router.get('/meta/options', (req, res) => {
  res.json({
    statuses: FOLLOW_UP_STATUSES,
    knowledge_sources: KNOWLEDGE_SOURCES,
  });
});

// Dashboard stats — total, per-status, overdue follow-ups, this month's new
router.get('/stats/overview', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [
      total,
      newCount,
      followUpCount,
      interestedCount,
      notInterestedCount,
      convertedCount,
      overdueFollowUps,
      thisMonthNew,
      thisMonthConverted,
    ] = await Promise.all([
      Enquiry.countDocuments(),
      Enquiry.countDocuments({ status: 'New' }),
      Enquiry.countDocuments({ status: 'Follow Up' }),
      Enquiry.countDocuments({ status: 'Interested' }),
      Enquiry.countDocuments({ status: 'Not Interested' }),
      Enquiry.countDocuments({ status: 'Converted' }),
      Enquiry.countDocuments({
        next_follow_up_date: { $lt: now },
        status: { $nin: ['Converted', 'Not Interested'] },
      }),
      Enquiry.countDocuments({ enquiry_date: { $gte: startOfMonth, $lte: endOfMonth } }),
      Enquiry.countDocuments({
        status: 'Converted',
        converted_at: { $gte: startOfMonth, $lte: endOfMonth },
      }),
    ]);

    const conversionRate = total > 0 ? Math.round((convertedCount / total) * 100) : 0;

    res.json({
      total,
      new: newCount,
      follow_up: followUpCount,
      interested: interestedCount,
      not_interested: notInterestedCount,
      converted: convertedCount,
      overdue_follow_ups: overdueFollowUps,
      this_month_new: thisMonthNew,
      this_month_converted: thisMonthConverted,
      conversion_rate: conversionRate,
    });
  } catch (error) {
    console.error('Error fetching enquiry stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== LIST / READ ====================

// Get all enquiries with optional filters
router.get('/', async (req, res) => {
  try {
    const {
      status,
      search,
      source,
      class_interested,
      overdue_only,
      page = 1,
      limit = 200,
    } = req.query;

    const query = {};

    if (status && status !== 'all') query.status = status;
    if (source && source !== 'all') query.knowledge_source = source;
    if (class_interested && class_interested !== 'all') query.class_interested = class_interested;

    if (overdue_only === 'true') {
      query.next_follow_up_date = { $lt: new Date() };
      query.status = { $nin: ['Converted', 'Not Interested'] };
    }

    if (search) {
      const term = search.trim();
      query.$or = [
        { student_name: { $regex: term, $options: 'i' } },
        { parent_name: { $regex: term, $options: 'i' } },
        { parent_phone: { $regex: term, $options: 'i' } },
        { parent_email: { $regex: term, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [enquiries, total] = await Promise.all([
      Enquiry.find(query)
        .sort({ last_follow_up_date: -1, enquiry_date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Enquiry.countDocuments(query),
    ]);

    res.json({
      data: enquiries,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching enquiries:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single enquiry
router.get('/:id', async (req, res) => {
  try {
    const enquiry = await Enquiry.findById(req.params.id)
      .populate('converted_student_id', 'name class_id section');

    if (!enquiry) {
      return res.status(404).json({ message: 'Enquiry not found' });
    }
    res.json(enquiry);
  } catch (error) {
    console.error('Error fetching enquiry:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== CREATE ====================

router.post('/', async (req, res) => {
  try {
    const {
      student_name,
      parent_name,
      parent_phone,
      knowledge_source,
    } = req.body;

    if (!student_name?.trim()) {
      return res.status(400).json({ message: "Student name is required" });
    }
    if (!parent_name?.trim()) {
      return res.status(400).json({ message: "Parent name is required" });
    }
    if (!parent_phone || !/^\d{10}$/.test(sanitizePhone(parent_phone))) {
      return res.status(400).json({ message: 'Parent phone must be exactly 10 digits' });
    }
    if (!knowledge_source) {
      return res.status(400).json({ message: 'Please select how the parent knows about the school' });
    }

    const payload = buildEnquiryPayload(req.body, { isUpdate: false });

    // Seed the follow-up history with the initial visit
    payload.follow_up_history = [
      {
        note: `Initial enquiry — first visit on ${new Date(
          payload.first_visit_date
        ).toLocaleDateString()}. Source: ${payload.knowledge_source}`,
        status_at_time: payload.status || 'New',
        next_follow_up_date: payload.next_follow_up_date || null,
        recorded_by: req.body.recorded_by || 'Admin',
        recorded_at: new Date(),
      },
    ];

    // If a next follow-up date is provided on create, log it as the last follow-up date
    if (payload.next_follow_up_date) {
      payload.last_follow_up_date = new Date();
    }

    const enquiry = new Enquiry(payload);
    const saved = await enquiry.save();

    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating enquiry:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== UPDATE ====================

router.put('/:id', async (req, res) => {
  try {
    const existing = await Enquiry.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Enquiry not found' });
    }

    const payload = buildEnquiryPayload(req.body, { isUpdate: true });
    payload.updated_at = Date.now();

    // If status flipped to Converted and no converted_at yet, stamp it
    if (payload.status === 'Converted' && !existing.converted_at) {
      payload.converted_at = new Date();
    }
    // If status moved away from Converted, clear the conversion stamp
    if (payload.status && payload.status !== 'Converted' && existing.status === 'Converted') {
      payload.converted_at = null;
      payload.converted_student_id = null;
    }

    const enquiry = await Enquiry.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    res.json(enquiry);
  } catch (error) {
    console.error('Error updating enquiry:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== FOLLOW-UP ====================

// Add a follow-up note, optionally updating status and next follow-up date
router.post('/:id/follow-up', async (req, res) => {
  try {
    const { note, status, next_follow_up_date, recorded_by } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ message: 'Follow-up note is required' });
    }

    const enquiry = await Enquiry.findById(req.params.id);
    if (!enquiry) {
      return res.status(404).json({ message: 'Enquiry not found' });
    }

    // Determine the effective status for this follow-up entry
    const effectiveStatus = status || enquiry.status || 'Follow Up';

    enquiry.follow_up_history.push({
      note: note.trim(),
      status_at_time: effectiveStatus,
      next_follow_up_date: next_follow_up_date ? new Date(next_follow_up_date) : null,
      recorded_by: recorded_by || 'Admin',
      recorded_at: new Date(),
    });

    enquiry.last_follow_up_date = new Date();
    enquiry.next_follow_up_date = next_follow_up_date ? new Date(next_follow_up_date) : null;
    enquiry.status = effectiveStatus;
    enquiry.updated_at = Date.now();

    if (effectiveStatus === 'Converted' && !enquiry.converted_at) {
      enquiry.converted_at = new Date();
    }

    await enquiry.save();
    res.json(enquiry);
  } catch (error) {
    console.error('Error recording follow-up:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== CONVERT TO STUDENT ====================

// Mark as converted, optionally link to a student created elsewhere
router.post('/:id/convert', async (req, res) => {
  try {
    const { student_id, note } = req.body;

    const enquiry = await Enquiry.findById(req.params.id);
    if (!enquiry) {
      return res.status(404).json({ message: 'Enquiry not found' });
    }

    if (student_id) {
      const student = await Student.findById(student_id).select('name');
      if (!student) {
        return res.status(404).json({ message: 'Linked student not found' });
      }
      enquiry.converted_student_id = student_id;
    }

    enquiry.status = 'Converted';
    enquiry.converted_at = new Date();
    enquiry.last_follow_up_date = new Date();
    enquiry.next_follow_up_date = null;
    enquiry.updated_at = Date.now();

    enquiry.follow_up_history.push({
      note: note?.trim() || 'Enquiry converted to admission.',
      status_at_time: 'Converted',
      next_follow_up_date: null,
      recorded_by: req.body.recorded_by || 'Admin',
      recorded_at: new Date(),
    });

    await enquiry.save();

    const populated = await Enquiry.findById(enquiry._id)
      .populate('converted_student_id', 'name class_id section');

    res.json(populated);
  } catch (error) {
    console.error('Error converting enquiry:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== DELETE ====================

router.delete('/:id', async (req, res) => {
  try {
    const enquiry = await Enquiry.findByIdAndDelete(req.params.id);
    if (!enquiry) {
      return res.status(404).json({ message: 'Enquiry not found' });
    }
    res.json({ message: 'Enquiry deleted successfully', _id: req.params.id });
  } catch (error) {
    console.error('Error deleting enquiry:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;