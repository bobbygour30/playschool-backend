// resetParentPassword.js (place in root directory)
// Reset parent password
// Usage: node resetParentPassword.js <parent-id> <new-password>

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Try multiple locations for .env
let envFound = false;
const envPaths = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '../.env'),
  path.join(__dirname, '../../.env'),
  path.join(process.cwd(), '.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`📁 Loading .env from: ${envPath}`);
    dotenv.config({ path: envPath });
    envFound = true;
    break;
  }
}

// Also try without path
if (!envFound) {
  console.log('📁 Looking for .env in current directory...');
  dotenv.config();
}

// Try to load Parent model
let Parent;
try {
  Parent = require('./models/Parent');
} catch (e) {
  try {
    Parent = require('../models/Parent');
  } catch (e2) {
    console.error('❌ Could not load Parent model. Please run this from the root directory.');
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const PARENT_ID = args[0];
const NEW_PASSWORD = args[1] || 'password123';

if (!PARENT_ID) {
  console.error('❌ Please provide parent ID');
  console.log('Usage: node resetParentPassword.js <parent-id> <new-password>');
  process.exit(1);
}

async function resetPassword() {
  try {
    // Get MongoDB URI from environment
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
    
    if (!mongoURI) {
      console.error('❌ MongoDB URI not found in environment variables');
      console.log('\n📝 Available environment variables:');
      console.log(`   MONGODB_URI: ${process.env.MONGODB_URI || 'NOT SET'}`);
      console.log(`   MONGO_URI: ${process.env.MONGO_URI || 'NOT SET'}`);
      console.log(`   DATABASE_URL: ${process.env.DATABASE_URL || 'NOT SET'}`);
      
      // Ask user to enter URI manually
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const uri = await new Promise((resolve) => {
        rl.question('\n📝 Enter your MongoDB URI: ', (answer) => {
          rl.close();
          resolve(answer);
        });
      });
      
      if (!uri || uri.trim() === '') {
        console.error('❌ No URI provided. Exiting.');
        process.exit(1);
      }
      
      console.log('🔗 Connecting to MongoDB with provided URI...');
      await mongoose.connect(uri.trim(), {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    } else {
      console.log('🔗 Connecting to MongoDB...');
      await mongoose.connect(mongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
    
    console.log('✅ Connected to MongoDB');

    const parent = await Parent.findById(PARENT_ID);
    if (!parent) {
      console.error(`❌ Parent not found: ${PARENT_ID}`);
      process.exit(1);
    }

    console.log(`\n📝 Resetting password for:`);
    console.log(`   📧 Email: ${parent.email}`);
    console.log(`   👤 Parent Name: ${parent.parent_name}`);
    console.log(`   🔑 Username: ${parent.username}`);
    
    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, salt);
    
    parent.password = hashedPassword;
    parent.sync_status = 'pending'; // Mark for resync
    await parent.save();

    console.log(`\n✅ Password reset successfully!`);
    console.log(`   📧 Email: ${parent.email}`);
    console.log(`   👤 Username: ${parent.username}`);
    console.log(`   🔑 New Password: ${NEW_PASSWORD}`);
    console.log(`   🆔 Parent ID: ${parent._id}`);
    console.log(`   📊 Sync Status: pending (will sync on next sync)`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    try {
      await mongoose.disconnect();
    } catch (e) {}
    process.exit(1);
  }
}

resetPassword();