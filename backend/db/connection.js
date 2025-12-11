const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
const env = process.env.NODE_ENV || 'development';

// Extract database name from URI for display
const getDatabaseName = (uri) => {
  try {
    // Extract database name from MongoDB URI
    // Format: mongodb://host:port/database or mongodb+srv://host/database
    const match = uri.match(/\/([^?]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
};

const databaseName = getDatabaseName(uri);
const DB = mongoose.connect(uri);

DB.then(() => {
    console.log("✅ Database successfully connected");
    console.log(`📊 Database: ${databaseName}`);
    console.log(`🌍 Environment: ${env}`);
  }).catch((err) => {
    console.error("❌ Database connection failed:");
    console.error(err);
  });
  
 
  module.exports = DB;