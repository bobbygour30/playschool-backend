const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Remove the deprecated options as they are no longer needed in newer Mongoose versions
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    // Don't exit the process in serverless environment
    // Instead, throw the error to be handled by the caller
    throw error;
  }
};

module.exports = connectDB;