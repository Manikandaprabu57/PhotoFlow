/**
 * S3 Event Cleanup Utility
 * Use this script to manually clean up an event from S3 bucket
 * This is useful if the automatic deletion didn't work properly
 */

require('dotenv').config();
const { StorageFactory } = require('./storage');

async function cleanupS3Event(eventName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🗑️  S3 Event Cleanup Utility`);
  console.log(`${'='.repeat(60)}`);
  
  if (!eventName) {
    console.error('❌ Error: Event name is required');
    console.log('\nUsage: node cleanup-s3-event.js <event-name>');
    console.log('Example: node cleanup-s3-event.js wedding_jan_20\n');
    process.exit(1);
  }
  
  try {
    // Initialize cloud storage
    console.log(`\n☁️  Initializing ${process.env.CLOUD_STORAGE_PROVIDER} storage...`);
    const cloudStorage = await StorageFactory.createFromEnv();
    console.log('✅ Cloud storage initialized\n');
    
    // List all files in the event directory
    const eventPath = `events/${eventName}`;
    console.log(`📋 Scanning for files in: ${eventPath}`);
    
    const files = await cloudStorage.list(eventPath);
    
    if (files.length === 0) {
      console.log(`\n✅ No files found - event already clean or doesn't exist`);
      process.exit(0);
    }
    
    console.log(`\n📊 Found ${files.length} files to delete:`);
    
    // Group files by type for better visualization
    const filesByType = {
      photos: [],
      selfies: [],
      matched: [],
      exports: [],
      other: []
    };
    
    files.forEach(file => {
      if (file.path.includes('/photos/')) filesByType.photos.push(file);
      else if (file.path.includes('/selfies/')) filesByType.selfies.push(file);
      else if (file.path.includes('/matched/')) filesByType.matched.push(file);
      else if (file.path.includes('/exports/')) filesByType.exports.push(file);
      else filesByType.other.push(file);
    });
    
    console.log(`   - Photos: ${filesByType.photos.length}`);
    console.log(`   - Selfies: ${filesByType.selfies.length}`);
    console.log(`   - Matched: ${filesByType.matched.length}`);
    console.log(`   - Exports: ${filesByType.exports.length}`);
    console.log(`   - Other: ${filesByType.other.length}`);
    
    // Calculate total size
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`\n💾 Total size: ${totalSizeMB} MB`);
    
    // Confirm deletion
    console.log(`\n⚠️  WARNING: This will permanently delete all ${files.length} files!`);
    console.log(`Press Ctrl+C to cancel or wait 5 seconds to continue...`);
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log(`\n🗑️  Starting deletion...`);
    
    // Delete all files
    let deleted = 0;
    let failed = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = Math.floor((i / files.length) * 100);
      
      process.stdout.write(`\r⏳ Progress: ${progress}% (${i}/${files.length}) - Deleting: ${file.name}...                    `);
      
      try {
        await cloudStorage.delete(file.path);
        deleted++;
      } catch (error) {
        console.error(`\n❌ Failed to delete ${file.path}:`, error.message);
        failed++;
      }
    }
    
    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`✅ Cleanup Complete!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   Successfully deleted: ${deleted} files`);
    if (failed > 0) {
      console.log(`   Failed: ${failed} files`);
    }
    console.log(`   Event: ${eventName}`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Get event name from command line arguments
const eventName = process.argv[2];
cleanupS3Event(eventName);
