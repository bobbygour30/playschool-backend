const express = require('express');
const router = express.Router();
const Assessment = require('../models/Assessment');
const Event = require('../models/Event');
const Culmination = require('../models/Culmination');
const AcademicClass = require('../models/AcademicClass');
const Document = require('../models/Document');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// ==================== CLASS MANAGEMENT ====================

// Get all academic classes
router.get('/classes', async (req, res) => {
  try {
    const classes = await AcademicClass.find().sort({ created_at: 1 });
    res.json(classes);
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create a new class (if needed for custom classes)
router.post('/classes', async (req, res) => {
  try {
    const { name, class_id, age_group, description } = req.body;
    const academicClass = new AcademicClass({ name, class_id, age_group, description });
    const savedClass = await academicClass.save();
    res.status(201).json(savedClass);
  } catch (error) {
    console.error('Error creating class:', error);
    res.status(400).json({ message: error.message });
  }
});

// ==================== DOCUMENT MANAGEMENT ====================

// Get all documents for a specific class and month
router.get('/documents/:classId/:month', async (req, res) => {
  try {
    const { classId, month } = req.params;
    const documents = await Document.find({ 
      class_id: classId, 
      month: parseInt(month) 
    }).populate('uploaded_by', 'name email').sort({ created_at: -1 });
    
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get all documents for a specific class (all months)
router.get('/documents/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const documents = await Document.find({ class_id: classId })
      .populate('uploaded_by', 'name email')
      .sort({ month: 1, created_at: -1 });
    
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single document by ID
router.get('/document/:id', async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate('uploaded_by', 'name email');
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create/Upload document
router.post('/documents', async (req, res) => {
  try {
    const {
      class_id,
      month,
      title,
      description,
      file,
      file_name,
      file_type,
      uploaded_by,
    } = req.body;
    
    // Upload file to Cloudinary
    let uploadedFileUrl = null;
    if (file) {
      uploadedFileUrl = await uploadToCloudinary(file, `academics/documents/${class_id}/${month}`);
    }
    
    if (!uploadedFileUrl) {
      return res.status(400).json({ message: 'Failed to upload file' });
    }
    
    const document = new Document({
      class_id,
      month: parseInt(month),
      title,
      description: description || '',
      file_name,
      file_type,
      file_url: uploadedFileUrl,
      uploaded_by: uploaded_by || null,
    });
    
    const savedDocument = await document.save();
    const populatedDocument = await Document.findById(savedDocument._id)
      .populate('uploaded_by', 'name email');
    
    res.status(201).json(populatedDocument);
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update document
router.put('/document/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingDocument = await Document.findById(id);
    
    if (!existingDocument) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    const {
      title,
      description,
      file,
      file_name,
      file_type,
    } = req.body;
    
    // Handle file update
    let uploadedFileUrl = existingDocument.file_url;
    if (file && file !== existingDocument.file_url) {
      // Delete old file from Cloudinary
      if (existingDocument.file_url) {
        await deleteFromCloudinary(existingDocument.file_url);
      }
      // Upload new file
      uploadedFileUrl = await uploadToCloudinary(file, `academics/documents/${existingDocument.class_id}/${existingDocument.month}`);
    }
    
    const documentData = {
      title,
      description: description || '',
      file_name: file_name || existingDocument.file_name,
      file_type: file_type || existingDocument.file_type,
      file_url: uploadedFileUrl,
      updated_at: Date.now(),
    };
    
    const document = await Document.findByIdAndUpdate(
      id,
      documentData,
      { new: true, runValidators: true }
    ).populate('uploaded_by', 'name email');
    
    res.json(document);
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete document
router.delete('/document/:id', async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    // Delete file from Cloudinary
    if (document.file_url) {
      await deleteFromCloudinary(document.file_url);
    }
    
    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get document statistics
router.get('/documents/stats/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const stats = {};
    
    for (let month = 0; month < 12; month++) {
      const count = await Document.countDocuments({ class_id: classId, month });
      stats[month] = count;
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching document stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== ASSESSMENTS ====================

// Get all assessments for a specific class
router.get('/assessments/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const assessments = await Assessment.find({ class_id: classId })
      .populate('created_by', 'name email')
      .sort({ date: -1 });
    res.json(assessments);
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get all assessments (for admin overview)
router.get('/assessments', async (req, res) => {
  try {
    const assessments = await Assessment.find()
      .populate('created_by', 'name email')
      .sort({ date: -1 });
    res.json(assessments);
  } catch (error) {
    console.error('Error fetching all assessments:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single assessment by ID
router.get('/assessment/:id', async (req, res) => {
  try {
    const assessment = await Assessment.findById(req.params.id)
      .populate('created_by', 'name email');
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found' });
    }
    res.json(assessment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create assessment with document upload
router.post('/assessments', async (req, res) => {
  try {
    const {
      class_id,
      title,
      date,
      subject,
      marks,
      status,
      description,
      attachments,
      created_by,
    } = req.body;
    
    // Upload attachments to Cloudinary if provided
    const uploadedAttachments = [];
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const uploadedUrl = await uploadToCloudinary(attachment, 'academics/assessments');
        if (uploadedUrl) {
          uploadedAttachments.push(uploadedUrl);
        }
      }
    }
    
    const assessment = new Assessment({
      class_id,
      title,
      date: new Date(date),
      subject,
      marks,
      status: status || 'upcoming',
      description,
      attachments: uploadedAttachments,
      created_by: created_by || null,
    });
    
    const savedAssessment = await assessment.save();
    const populatedAssessment = await Assessment.findById(savedAssessment._id)
      .populate('created_by', 'name email');
    
    res.status(201).json(populatedAssessment);
  } catch (error) {
    console.error('Error creating assessment:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update assessment
router.put('/assessment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingAssessment = await Assessment.findById(id);
    
    if (!existingAssessment) {
      return res.status(404).json({ message: 'Assessment not found' });
    }
    
    const {
      title,
      date,
      subject,
      marks,
      status,
      description,
      attachments,
    } = req.body;
    
    // Handle attachment updates
    let uploadedAttachments = existingAssessment.attachments || [];
    
    if (attachments && attachments.length > 0) {
      // Delete old attachments if they are being replaced
      for (const oldAttachment of existingAssessment.attachments) {
        await deleteFromCloudinary(oldAttachment);
      }
      
      // Upload new attachments
      uploadedAttachments = [];
      for (const attachment of attachments) {
        const uploadedUrl = await uploadToCloudinary(attachment, 'academics/assessments');
        if (uploadedUrl) {
          uploadedAttachments.push(uploadedUrl);
        }
      }
    }
    
    const assessmentData = {
      title,
      date: new Date(date),
      subject,
      marks,
      status,
      description,
      attachments: uploadedAttachments,
      updated_at: Date.now(),
    };
    
    const assessment = await Assessment.findByIdAndUpdate(
      id,
      assessmentData,
      { new: true, runValidators: true }
    ).populate('created_by', 'name email');
    
    res.json(assessment);
  } catch (error) {
    console.error('Error updating assessment:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete assessment
router.delete('/assessment/:id', async (req, res) => {
  try {
    const assessment = await Assessment.findById(req.params.id);
    
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found' });
    }
    
    // Delete attachments from Cloudinary
    for (const attachment of assessment.attachments) {
      await deleteFromCloudinary(attachment);
    }
    
    await Assessment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Assessment deleted successfully' });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== EVENTS ====================

// Get all events for a specific class
router.get('/events/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const events = await Event.find({ class_id: classId })
      .populate('created_by', 'name email')
      .sort({ date: -1 });
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get all events (for admin overview)
router.get('/events', async (req, res) => {
  try {
    const events = await Event.find()
      .populate('created_by', 'name email')
      .sort({ date: -1 });
    res.json(events);
  } catch (error) {
    console.error('Error fetching all events:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single event by ID
router.get('/event/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('created_by', 'name email');
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create event with document upload
router.post('/events', async (req, res) => {
  try {
    const {
      class_id,
      title,
      date,
      type,
      status,
      description,
      venue,
      attachments,
      created_by,
    } = req.body;
    
    // Upload attachments to Cloudinary if provided
    const uploadedAttachments = [];
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const uploadedUrl = await uploadToCloudinary(attachment, 'academics/events');
        if (uploadedUrl) {
          uploadedAttachments.push(uploadedUrl);
        }
      }
    }
    
    const event = new Event({
      class_id,
      title,
      date: new Date(date),
      type,
      status: status || 'upcoming',
      description,
      venue: venue || '',
      attachments: uploadedAttachments,
      created_by: created_by || null,
    });
    
    const savedEvent = await event.save();
    const populatedEvent = await Event.findById(savedEvent._id)
      .populate('created_by', 'name email');
    
    res.status(201).json(populatedEvent);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update event
router.put('/event/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingEvent = await Event.findById(id);
    
    if (!existingEvent) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    const {
      title,
      date,
      type,
      status,
      description,
      venue,
      attachments,
    } = req.body;
    
    // Handle attachment updates
    let uploadedAttachments = existingEvent.attachments || [];
    
    if (attachments && attachments.length > 0) {
      // Delete old attachments if they are being replaced
      for (const oldAttachment of existingEvent.attachments) {
        await deleteFromCloudinary(oldAttachment);
      }
      
      // Upload new attachments
      uploadedAttachments = [];
      for (const attachment of attachments) {
        const uploadedUrl = await uploadToCloudinary(attachment, 'academics/events');
        if (uploadedUrl) {
          uploadedAttachments.push(uploadedUrl);
        }
      }
    }
    
    const eventData = {
      title,
      date: new Date(date),
      type,
      status,
      description,
      venue,
      attachments: uploadedAttachments,
      updated_at: Date.now(),
    };
    
    const event = await Event.findByIdAndUpdate(
      id,
      eventData,
      { new: true, runValidators: true }
    ).populate('created_by', 'name email');
    
    res.json(event);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete event
router.delete('/event/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Delete attachments from Cloudinary
    for (const attachment of event.attachments) {
      await deleteFromCloudinary(attachment);
    }
    
    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== CULMINATIONS ====================

// Get all culminations for a specific class
router.get('/culminations/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const culminations = await Culmination.find({ class_id: classId })
      .populate('created_by', 'name email')
      .sort({ date: -1 });
    res.json(culminations);
  } catch (error) {
    console.error('Error fetching culminations:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get all culminations (for admin overview)
router.get('/culminations', async (req, res) => {
  try {
    const culminations = await Culmination.find()
      .populate('created_by', 'name email')
      .sort({ date: -1 });
    res.json(culminations);
  } catch (error) {
    console.error('Error fetching all culminations:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single culmination by ID
router.get('/culmination/:id', async (req, res) => {
  try {
    const culmination = await Culmination.findById(req.params.id)
      .populate('created_by', 'name email');
    if (!culmination) {
      return res.status(404).json({ message: 'Culmination not found' });
    }
    res.json(culmination);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create culmination with document upload
router.post('/culminations', async (req, res) => {
  try {
    const {
      class_id,
      title,
      date,
      status,
      description,
      report,
      attachments,
      created_by,
    } = req.body;
    
    // Upload attachments to Cloudinary if provided
    const uploadedAttachments = [];
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const uploadedUrl = await uploadToCloudinary(attachment, 'academics/culminations');
        if (uploadedUrl) {
          uploadedAttachments.push(uploadedUrl);
        }
      }
    }
    
    const culmination = new Culmination({
      class_id,
      title,
      date: new Date(date),
      status: status || 'upcoming',
      description,
      report: report || '',
      attachments: uploadedAttachments,
      created_by: created_by || null,
    });
    
    const savedCulmination = await culmination.save();
    const populatedCulmination = await Culmination.findById(savedCulmination._id)
      .populate('created_by', 'name email');
    
    res.status(201).json(populatedCulmination);
  } catch (error) {
    console.error('Error creating culmination:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update culmination
router.put('/culmination/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingCulmination = await Culmination.findById(id);
    
    if (!existingCulmination) {
      return res.status(404).json({ message: 'Culmination not found' });
    }
    
    const {
      title,
      date,
      status,
      description,
      report,
      attachments,
    } = req.body;
    
    // Handle attachment updates
    let uploadedAttachments = existingCulmination.attachments || [];
    
    if (attachments && attachments.length > 0) {
      // Delete old attachments if they are being replaced
      for (const oldAttachment of existingCulmination.attachments) {
        await deleteFromCloudinary(oldAttachment);
      }
      
      // Upload new attachments
      uploadedAttachments = [];
      for (const attachment of attachments) {
        const uploadedUrl = await uploadToCloudinary(attachment, 'academics/culminations');
        if (uploadedUrl) {
          uploadedAttachments.push(uploadedUrl);
        }
      }
    }
    
    const culminationData = {
      title,
      date: new Date(date),
      status,
      description,
      report,
      attachments: uploadedAttachments,
      updated_at: Date.now(),
    };
    
    const culmination = await Culmination.findByIdAndUpdate(
      id,
      culminationData,
      { new: true, runValidators: true }
    ).populate('created_by', 'name email');
    
    res.json(culmination);
  } catch (error) {
    console.error('Error updating culmination:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete culmination
router.delete('/culmination/:id', async (req, res) => {
  try {
    const culmination = await Culmination.findById(req.params.id);
    
    if (!culmination) {
      return res.status(404).json({ message: 'Culmination not found' });
    }
    
    // Delete attachments from Cloudinary
    for (const attachment of culmination.attachments) {
      await deleteFromCloudinary(attachment);
    }
    
    await Culmination.findByIdAndDelete(req.params.id);
    res.json({ message: 'Culmination deleted successfully' });
  } catch (error) {
    console.error('Error deleting culmination:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== DASHBOARD STATISTICS ====================

// Get academic statistics for dashboard
router.get('/stats', async (req, res) => {
  try {
    const classes = ['toddler', 'pre-nursery', 'nursery', 'kg-1'];
    const stats = {};
    
    for (const classId of classes) {
      const assessments = await Assessment.countDocuments({ class_id: classId });
      const completedAssessments = await Assessment.countDocuments({ class_id: classId, status: 'completed' });
      const events = await Event.countDocuments({ class_id: classId });
      const upcomingEvents = await Event.countDocuments({ class_id: classId, status: 'upcoming' });
      const culminations = await Culmination.countDocuments({ class_id: classId });
      const documents = await Document.countDocuments({ class_id: classId });
      
      stats[classId] = {
        totalAssessments: assessments,
        completedAssessments,
        totalEvents: events,
        upcomingEvents,
        totalCulminations: culminations,
        totalDocuments: documents,
      };
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching academic stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get upcoming items (assessments, events, culminations)
router.get('/upcoming', async (req, res) => {
  try {
    const today = new Date();
    
    const [upcomingAssessments, upcomingEvents, upcomingCulminations] = await Promise.all([
      Assessment.find({ date: { $gte: today }, status: 'upcoming' })
        .populate('created_by', 'name')
        .sort({ date: 1 })
        .limit(10),
      Event.find({ date: { $gte: today }, status: 'upcoming' })
        .populate('created_by', 'name')
        .sort({ date: 1 })
        .limit(10),
      Culmination.find({ date: { $gte: today }, status: 'upcoming' })
        .populate('created_by', 'name')
        .sort({ date: 1 })
        .limit(10),
    ]);
    
    res.json({
      assessments: upcomingAssessments,
      events: upcomingEvents,
      culminations: upcomingCulminations,
    });
  } catch (error) {
    console.error('Error fetching upcoming items:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;