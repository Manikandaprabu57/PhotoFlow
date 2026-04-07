/**
 * Migration Script: Local Storage to Cloud Storage
 * 
 * This script helps you migrate existing local files to cloud storage.
 * Run this after setting up cloud storage to upload existing events.
 * 
 * Usage:
 *   node migrate-to-cloud.js                    # Migrate all events
 *   node migrate-to-cloud.js eventName          # Migrate specific event
 *   node migrate-to-cloud.js --dry-run          # Preview without uploading
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { StorageFactory } = require('./storage');

const EVENTS_DIR = path.join(__dirname, 'events');

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const specificEvent = args.find(arg => !arg.startsWith('--'));

console.log('\n' + '='.repeat(60));
console.log('📦 PhotoFlow Cloud Migration Tool');
console.log('='.repeat(60) + '\n');

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No files will be uploaded\n');
}

// Get all image files recursively
function getImageFiles(dir, baseDir = dir) {
  const files = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }

  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getImageFiles(fullPath, baseDir));
    } else if (/\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(item)) {
      const relativePath = path.relative(baseDir, fullPath);
      files.push({
        fullPath,
        relativePath: relativePath.replace(/\\/g, '/'),
        size: stat.size,
        name: item
      });
    }
  }
  
  return files;
}

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Upload a single file
async function uploadFile(storage, file, eventName) {
  const cloudPath = `events/${eventName}/${file.relativePath}`;
  
  try {
    // Check if file already exists in cloud
    const exists = await storage.exists(cloudPath);
    if (exists) {
      console.log(`  ⏭️  Skipped (already exists): ${file.name}`);
      return { skipped: true, size: file.size };
    }

    if (dryRun) {
      console.log(`  📋 Would upload: ${file.name} (${formatBytes(file.size)})`);
      return { uploaded: true, size: file.size };
    }

    // Read file and upload
    const buffer = fs.readFileSync(file.fullPath);
    const ext = path.extname(file.name).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp'
    };

    await storage.upload(buffer, cloudPath, {
      mimetype: mimeTypes[ext] || 'image/jpeg'
    });

    console.log(`  ✅ Uploaded: ${file.name} (${formatBytes(file.size)})`);
    return { uploaded: true, size: file.size };
  } catch (error) {
    console.error(`  ❌ Failed: ${file.name} - ${error.message}`);
    return { failed: true, size: file.size, error: error.message };
  }
}

// Migrate a single event
async function migrateEvent(storage, eventName) {
  console.log(`\n📁 Processing event: ${eventName}`);
  console.log('-'.repeat(60));

  const eventPath = path.join(EVENTS_DIR, eventName);
  
  if (!fs.existsSync(eventPath)) {
    console.log(`  ⚠️  Event directory not found: ${eventPath}`);
    return null;
  }

  // Get all image files in the event
  const files = getImageFiles(eventPath, EVENTS_DIR);
  
  if (files.length === 0) {
    console.log(`  ℹ️  No image files found`);
    return { eventName, total: 0, uploaded: 0, skipped: 0, failed: 0, totalSize: 0 };
  }

  console.log(`  📊 Found ${files.length} files (${formatBytes(files.reduce((sum, f) => sum + f.size, 0))})`);
  console.log('');

  const stats = {
    eventName,
    total: files.length,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    totalSize: 0,
    uploadedSize: 0,
    errors: []
  };

  // Upload each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`  [${i + 1}/${files.length}] ${file.relativePath}`);
    
    const result = await uploadFile(storage, file, eventName);
    
    if (result.uploaded) {
      stats.uploaded++;
      stats.uploadedSize += result.size;
    } else if (result.skipped) {
      stats.skipped++;
    } else if (result.failed) {
      stats.failed++;
      stats.errors.push({ file: file.name, error: result.error });
    }
    
    stats.totalSize += file.size;
  }

  return stats;
}

// Main migration function
async function migrate() {
  try {
    // Initialize cloud storage
    console.log('☁️  Initializing cloud storage...\n');
    
    const provider = process.env.CLOUD_STORAGE_PROVIDER;
    if (!provider || provider === 'local') {
      console.error('❌ Error: CLOUD_STORAGE_PROVIDER not set or set to "local"');
      console.error('   Please configure a cloud storage provider in .env file\n');
      console.error('   Examples:');
      console.error('   - CLOUD_STORAGE_PROVIDER=s3');
      console.error('   - CLOUD_STORAGE_PROVIDER=mega');
      console.error('   - CLOUD_STORAGE_PROVIDER=gcs\n');
      process.exit(1);
    }

    const storage = await StorageFactory.createFromEnv();
    console.log(`✅ Connected to ${provider.toUpperCase()} cloud storage\n`);

    // Get events to migrate
    let eventsToMigrate = [];
    
    if (specificEvent) {
      eventsToMigrate = [specificEvent];
      console.log(`🎯 Migrating specific event: ${specificEvent}\n`);
    } else {
      if (!fs.existsSync(EVENTS_DIR)) {
        console.error(`❌ Error: Events directory not found: ${EVENTS_DIR}`);
        process.exit(1);
      }

      eventsToMigrate = fs.readdirSync(EVENTS_DIR).filter(item => {
        const itemPath = path.join(EVENTS_DIR, item);
        return fs.statSync(itemPath).isDirectory();
      });

      if (eventsToMigrate.length === 0) {
        console.log('ℹ️  No events found to migrate');
        process.exit(0);
      }

      console.log(`📋 Found ${eventsToMigrate.length} events to migrate:\n`);
      eventsToMigrate.forEach((event, i) => {
        console.log(`   ${i + 1}. ${event}`);
      });
      console.log('');
    }

    // Migrate each event
    const allStats = [];
    
    for (const eventName of eventsToMigrate) {
      const stats = await migrateEvent(storage, eventName);
      if (stats) {
        allStats.push(stats);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60) + '\n');

    let totalFiles = 0;
    let totalUploaded = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let totalSize = 0;
    let totalUploadedSize = 0;

    allStats.forEach(stats => {
      console.log(`📁 ${stats.eventName}:`);
      console.log(`   Total files: ${stats.total}`);
      console.log(`   Uploaded: ${stats.uploaded} (${formatBytes(stats.uploadedSize)})`);
      console.log(`   Skipped: ${stats.skipped}`);
      console.log(`   Failed: ${stats.failed}`);
      if (stats.errors.length > 0) {
        console.log(`   Errors:`);
        stats.errors.forEach(err => {
          console.log(`     - ${err.file}: ${err.error}`);
        });
      }
      console.log('');

      totalFiles += stats.total;
      totalUploaded += stats.uploaded;
      totalSkipped += stats.skipped;
      totalFailed += stats.failed;
      totalSize += stats.totalSize;
      totalUploadedSize += stats.uploadedSize;
    });

    console.log('─'.repeat(60));
    console.log(`📊 Overall:`);
    console.log(`   Events processed: ${allStats.length}`);
    console.log(`   Total files: ${totalFiles}`);
    console.log(`   Uploaded: ${totalUploaded} (${formatBytes(totalUploadedSize)})`);
    console.log(`   Skipped: ${totalSkipped}`);
    console.log(`   Failed: ${totalFailed}`);
    console.log(`   Total size: ${formatBytes(totalSize)}`);
    console.log('');

    if (dryRun) {
      console.log('ℹ️  This was a dry run. No files were actually uploaded.');
      console.log('   Run without --dry-run to perform the actual migration.\n');
    } else if (totalFailed > 0) {
      console.log('⚠️  Migration completed with errors. Please review the failed uploads.\n');
      process.exit(1);
    } else {
      console.log('✅ Migration completed successfully!\n');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
