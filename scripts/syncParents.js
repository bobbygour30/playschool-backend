// scripts/syncParents.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from the correct path
dotenv.config({ path: path.join(__dirname, '../.env') });

// ✅ IMPORT ALL MODELS FIRST - This registers them with mongoose
const Parent = require('../models/Parent');
// Make sure Student model is imported and registered
const Student = require('../models/Student');  // ✅ ADD THIS
// Also import any other models that might be referenced
// const Faculty = require('../models/Faculty');

const syncToMobileBackend = require('../utils/syncParentToMobile');

// Parse command line arguments
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');
const PARENT_ID = args.find(arg => arg.startsWith('--parent-id='))?.split('=')[1];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function syncParent(parent, dryRun = false) {
  const email = parent.email || parent.parent_name;
  const status = parent.sync_status || 'pending';
  
  log(colors.cyan, `\n📤 Syncing parent: ${email}`);
  log(colors.gray, `   ID: ${parent._id}`);
  log(colors.gray, `   Status: ${status}`);
  log(colors.gray, `   Students: ${parent.student_ids?.length || 0}`);
  
  if (dryRun) {
    log(colors.yellow, `   ⏭️ DRY RUN - Would sync this parent`);
    return { success: true, dryRun: true, parent: parent._id };
  }
  
  try {
    // Populate student_ids if not already populated
    if (parent.student_ids && parent.student_ids.length > 0) {
      // Check if we need to populate (if student_ids are ObjectIds, not populated objects)
      const firstStudent = parent.student_ids[0];
      if (typeof firstStudent === 'string' || firstStudent._id) {
        await parent.populate('student_ids', 'name class_id section rollNumber');
      }
    }
    
    const result = await syncToMobileBackend(parent);
    
    if (result.success) {
      // Update parent sync status
      parent.sync_status = 'synced';
      parent.synced_at = new Date();
      parent.sync_error = null;
      parent.sync_attempts = 0;
      await parent.save();
      
      log(colors.green, `   ✅ Parent synced successfully`);
      return { success: true, parent: parent._id };
    } else if (result.skipped) {
      log(colors.yellow, `   ⏭️ Sync skipped: ${result.error}`);
      // Don't update status for skipped (sync disabled)
      return { success: true, skipped: true, parent: parent._id };
    } else {
      // Update parent with failure
      parent.sync_status = 'failed';
      parent.sync_error = result.error;
      parent.sync_attempts = (parent.sync_attempts || 0) + 1;
      await parent.save();
      
      log(colors.red, `   ❌ Sync failed: ${result.error}`);
      return { success: false, error: result.error, parent: parent._id };
    }
  } catch (error) {
    log(colors.red, `   ❌ Error syncing parent: ${error.message}`);
    if (error.stack) {
      log(colors.gray, `   Stack: ${error.stack}`);
    }
    
    // Update parent with failure
    parent.sync_status = 'failed';
    parent.sync_error = error.message;
    parent.sync_attempts = (parent.sync_attempts || 0) + 1;
    await parent.save();
    
    return { success: false, error: error.message, parent: parent._id };
  }
}

async function syncAllParents() {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoURI) {
      log(colors.red, '❌ MongoDB URI not found in environment variables');
      log(colors.yellow, 'Please set MONGODB_URI or MONGO_URI in your .env file');
      process.exit(1);
    }
    
    log(colors.cyan, `🔗 Connecting to MongoDB...`);
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    log(colors.green, `✅ Connected to MongoDB`);
    
    // Build query based on arguments
    let query = {};
    let title = '';
    
    if (PARENT_ID) {
      // Sync specific parent by ID
      query._id = PARENT_ID;
      title = `Syncing parent with ID: ${PARENT_ID}`;
    } else if (FORCE) {
      // Force sync all parents regardless of status
      query = {};
      title = 'Force syncing ALL parents';
    } else {
      // Default: sync only pending and failed parents
      query = { sync_status: { $in: ['pending', 'failed'] } };
      title = 'Syncing parents with pending or failed status';
    }
    
    log(colors.magenta, `\n📋 ${title}`);
    log(colors.gray, `   DRY RUN: ${DRY_RUN ? 'YES' : 'NO'}`);
    log(colors.gray, `   FORCE: ${FORCE ? 'YES' : 'NO'}`);
    log(colors.gray, `   Filter: ${JSON.stringify(query)}`);
    
    // Get parents - populate student_ids so we have full student data
    const parents = await Parent.find(query)
      .populate('student_ids', 'name class_id section rollNumber');
    
    if (parents.length === 0) {
      log(colors.yellow, `\n📭 No parents found matching the criteria`);
      await mongoose.disconnect();
      process.exit(0);
    }
    
    log(colors.cyan, `\n📊 Found ${parents.length} parent(s) to sync`);
    
    // Statistics
    const stats = {
      total: parents.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };
    
    // Sync each parent
    for (let i = 0; i < parents.length; i++) {
      const parent = parents[i];
      const result = await syncParent(parent, DRY_RUN);
      
      if (result.success) {
        if (result.skipped) {
          stats.skipped++;
        } else {
          stats.success++;
        }
      } else {
        stats.failed++;
        stats.errors.push({
          id: parent._id,
          email: parent.email || parent.parent_name,
          error: result.error,
        });
      }
      
      // Progress indicator
      const progress = ((i + 1) / parents.length * 100).toFixed(1);
      log(colors.gray, `   Progress: ${progress}% (${i + 1}/${parents.length})`);
    }
    
    // Print summary
    log(colors.magenta, `\n${'='.repeat(60)}`);
    log(colors.bright, `📊 SYNC SUMMARY`);
    log(colors.magenta, `${'='.repeat(60)}`);
    log(colors.green, `   ✅ Success: ${stats.success}`);
    log(colors.yellow, `   ⏭️ Skipped: ${stats.skipped}`);
    log(colors.red, `   ❌ Failed: ${stats.failed}`);
    log(colors.cyan, `   📊 Total: ${stats.total}`);
    
    if (stats.errors.length > 0) {
      log(colors.red, `\n❌ Failed Parents:`);
      stats.errors.forEach(err => {
        log(colors.red, `   - ${err.email} (${err.id}): ${err.error}`);
      });
    }
    
    log(colors.magenta, `${'='.repeat(60)}\n`);
    
    // Disconnect
    await mongoose.disconnect();
    log(colors.green, `✅ Disconnected from MongoDB`);
    
    // Exit with appropriate code
    if (stats.failed > 0) {
      process.exit(1);
    }
    process.exit(0);
    
  } catch (error) {
    log(colors.red, `❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    try {
      await mongoose.disconnect();
    } catch (e) {
      // Ignore disconnect error
    }
    process.exit(1);
  }
}

// Run the script
syncAllParents();