const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    version: '1.0.0',
    endpoints: {
      students: '/api/students',
      faculty: '/api/faculty',
      leads: '/api/leads',
      vehicles: '/api/vehicles',
      classes: '/api/classes',
      status: '/api/status'
    }
  });
});

// Routes
app.use('/api/students', require('./routes/students'));
app.use('/api/faculty', require('./routes/faculty'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/classes', require('./routes/classes'));

// Error handler
app.use(require('./middleware/errorHandler'));

// Connect to database before handling requests
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
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Wrapper for serverless function
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

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════╗
║     🚀 PlaySchool Management API Server Started      ║
╠═══════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}          ║
║  API Status: http://localhost:${PORT}/api/status      ║
║  Health Check: http://localhost:${PORT}/api/health    ║
║  Environment: ${process.env.NODE_ENV || 'development'}                     ║
║  MongoDB: Connected ✅                                ║
╚═══════════════════════════════════════════════════════╝
      `);
    });
  }).catch(error => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });
}