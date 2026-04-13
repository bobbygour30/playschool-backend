const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 document uploads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Status Check Endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'success',
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: isConnected ? 'connected' : 'disconnected'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'PlaySchool Management API',
    version: '2.0.0',
    modules: {
      students: '/api/students',
      staff: '/api/staff',
      vendors: '/api/vendors',
      academics: '/api/academics',
      finance: '/api/finance',
      vehicles: '/api/vehicles',
      classes: '/api/classes',
    },
    endpoints: {
      students: '/api/students',
      staff: '/api/staff',
      vendors: '/api/vendors',
      academics: '/api/academics',
      finance: '/api/finance',
      vehicles: '/api/vehicles',
      classes: '/api/classes',
      status: '/api/status',
      health: '/api/health'
    }
  });
});

// ==================== ROUTES ====================

// Student Management
app.use('/api/students', require('./routes/students'));

// Staff Management (Replaces Faculty)
app.use('/api/staff', require('./routes/staff'));

// Vendor Management
app.use('/api/vendors', require('./routes/vendors'));

// Academics Management
app.use('/api/academics', require('./routes/academics'));

// Finance Management
app.use('/api/finance', require('./routes/finance'));

// Vehicle Management (For transport reference)
app.use('/api/vehicles', require('./routes/vehicles'));

// Classes Management (For academic reference)
app.use('/api/classes', require('./routes/classes'));

// ==================== ERROR HANDLER ====================
app.use(require('./middleware/errorHandler'));

// ==================== DATABASE CONNECTION ====================
let isConnected = false;

const connectToDatabase = async () => {
  if (!isConnected) {
    await connectDB();
    isConnected = true;
    console.log('MongoDB connection established and cached');
  }
  return isConnected;
};

// Health check endpoint for Vercel
app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = await connectToDatabase();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbStatus ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      modules: {
        students: true,
        staff: true,
        vendors: true,
        academics: true,
        finance: true,
        vehicles: true,
        classes: true
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Cannot find ${req.originalUrl} on this server`,
    availableEndpoints: [
      '/api/students',
      '/api/staff',
      '/api/vendors',
      '/api/academics',
      '/api/finance',
      '/api/vehicles',
      '/api/classes',
      '/api/status',
      '/api/health'
    ]
  });
});

// ==================== WRAPPER FOR SERVERLESS FUNCTION (Vercel) ====================
module.exports = async (req, res) => {
  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(500).json({ 
      status: 'error',
      message: 'Database connection failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== LOCAL DEVELOPMENT SERVER ====================
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║     🚀 PlaySchool Management API Server Started Successfully                  ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  📍 Server URL:      http://localhost:${PORT}                                  ║
║  📍 API Status:      http://localhost:${PORT}/api/status                      ║
║  📍 Health Check:    http://localhost:${PORT}/api/health                      ║
║                                                                               ║
║  📚 Available Modules:                                                        ║
║     • Students       → http://localhost:${PORT}/api/students                  ║
║     • Staff          → http://localhost:${PORT}/api/staff                     ║
║     • Vendors        → http://localhost:${PORT}/api/vendors                   ║
║     • Academics      → http://localhost:${PORT}/api/academics                 ║
║     • Finance        → http://localhost:${PORT}/api/finance                   ║
║     • Vehicles       → http://localhost:${PORT}/api/vehicles                  ║
║     • Classes        → http://localhost:${PORT}/api/classes                   ║
║                                                                               ║
║  🌍 Environment:     ${process.env.NODE_ENV || 'development'}                                    ║
║  🗄️  MongoDB:         Connected ✅                                             ║
║  ☁️  Cloudinary:      ${process.env.CLOUDINARY_CLOUD_NAME ? 'Configured ✅' : 'Not Configured ⚠️'}   ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
      `);
    });
  }).catch(error => {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  });
}