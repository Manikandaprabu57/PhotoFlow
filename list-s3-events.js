/**
 * S3 Events Listing Utility
 * Lists all events and their file counts in S3 bucket
 */

require('dotenv').config();
const { StorageFactory } = require('./storage');

async function listS3Events() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 S3 Events Listing Utility`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // Initialize cloud storage
    console.log(`\n☁️  Initializing ${process.env.CLOUD_STORAGE_PROVIDER} storage...`);
    const cloudStorage = await StorageFactory.createFromEnv();
    console.log('✅ Cloud storage initialized\n');
    
    // List all files in events directory
    console.log(`📋 Scanning all events...`);
    const allFiles = await cloudStorage.list('events/');
    
    if (allFiles.length === 0) {
      console.log(`\n✅ No events found in S3 bucket`);
      process.exit(0);
    }
    
    // Group files by event
    const eventStats = {};
    
    allFiles.forEach(file => {
      // Extract event name from path (events/<eventName>/...)
      const pathParts = file.path.split('/');
      if (pathParts.length < 2) return;
      
      const eventName = pathParts[1];
      if (!eventStats[eventName]) {
        eventStats[eventName] = {
          photos: 0,
          selfies: 0,
          matched: 0,
          exports: 0,
          other: 0,
          totalSize: 0
        };
      }
      
      // Categorize file
      if (file.path.includes('/photos/')) eventStats[eventName].photos++;
      else if (file.path.includes('/selfies/')) eventStats[eventName].selfies++;
      else if (file.path.includes('/matched/')) eventStats[eventName].matched++;
      else if (file.path.includes('/exports/')) eventStats[eventName].exports++;
      else eventStats[eventName].other++;
      
      eventStats[eventName].totalSize += (file.size || 0);
    });
    
    console.log(`\n📊 Found ${Object.keys(eventStats).length} event(s) in S3:\n`);
    
    // Display stats for each event
    Object.entries(eventStats).forEach(([eventName, stats]) => {
      const totalFiles = stats.photos + stats.selfies + stats.matched + stats.exports + stats.other;
      const totalSizeMB = (stats.totalSize / (1024 * 1024)).toFixed(2);
      
      console.log(`📸 ${eventName}`);
      console.log(`   Total files: ${totalFiles}`);
      console.log(`   - Photos: ${stats.photos}`);
      console.log(`   - Selfies: ${stats.selfies}`);
      console.log(`   - Matched: ${stats.matched}`);
      console.log(`   - Exports: ${stats.exports}`);
      console.log(`   - Other: ${stats.other}`);
      console.log(`   Size: ${totalSizeMB} MB`);
      console.log('');
    });
    
    // Calculate total
    const totalSize = Object.values(eventStats).reduce((sum, s) => sum + s.totalSize, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    const totalFiles = allFiles.length;
    
    console.log(`${'='.repeat(60)}`);
    console.log(`📊 Total Summary:`);
    console.log(`   Events: ${Object.keys(eventStats).length}`);
    console.log(`   Files: ${totalFiles}`);
    console.log(`   Storage: ${totalSizeMB} MB`);
    console.log(`${'='.repeat(60)}\n`);
    
    console.log(`💡 To delete an event, run:`);
    console.log(`   node cleanup-s3-event.js <event-name>\n`);
    
  } catch (error) {
    console.error('\n❌ Listing failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

listS3Events();
