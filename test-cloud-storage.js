/**
 * Cloud Storage Test Script
 * 
 * This script tests your cloud storage configuration before using it in production.
 * It performs basic operations to verify everything is working correctly.
 * 
 * Usage:
 *   node test-cloud-storage.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { StorageFactory } = require('./storage');

console.log('\n' + '='.repeat(60));
console.log('🧪 Cloud Storage Test Suite');
console.log('='.repeat(60) + '\n');

// Test data
const TEST_FILE_NAME = 'test-photo.jpg';
const TEST_FILE_PATH = `test/${TEST_FILE_NAME}`;
const TEST_FOLDER = 'test';

// Create a test image buffer (1x1 pixel JPEG)
const TEST_IMAGE_BUFFER = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
  0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
  0x3F, 0x00, 0x7F, 0xFF, 0xD9
]);

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, message = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - ${name}`);
  if (message) {
    console.log(`     ${message}`);
  }
  
  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
}

async function runTests() {
  let storage = null;
  
  try {
    // Test 1: Check environment configuration
    console.log('📋 Test 1: Environment Configuration\n');
    
    const provider = process.env.CLOUD_STORAGE_PROVIDER;
    if (!provider || provider === 'local') {
      logTest('Environment Check', false, 'CLOUD_STORAGE_PROVIDER not set or set to "local"');
      console.log('\n❌ Cannot proceed with tests. Please configure cloud storage in .env file\n');
      return;
    }
    
    logTest('Environment Check', true, `Provider: ${provider.toUpperCase()}`);
    
    // Check provider-specific configuration
    if (provider === 's3' || provider === 'aws') {
      const hasConfig = process.env.AWS_S3_BUCKET && 
                       process.env.AWS_ACCESS_KEY_ID && 
                       process.env.AWS_SECRET_ACCESS_KEY;
      logTest('AWS S3 Configuration', hasConfig, 
        hasConfig ? 'All required variables set' : 'Missing AWS credentials');
      if (!hasConfig) return;
    } else if (provider === 'mega') {
      const hasConfig = process.env.MEGA_EMAIL && process.env.MEGA_PASSWORD;
      logTest('MEGA Configuration', hasConfig,
        hasConfig ? 'All required variables set' : 'Missing MEGA credentials');
      if (!hasConfig) return;
    } else if (provider === 'gcs' || provider === 'google') {
      const hasConfig = process.env.GCS_BUCKET && 
                       process.env.GCS_PROJECT_ID;
      logTest('GCS Configuration', hasConfig,
        hasConfig ? 'All required variables set' : 'Missing GCS credentials');
      if (!hasConfig) return;
    }
    
    console.log('');
    
    // Test 2: Initialize storage
    console.log('📋 Test 2: Storage Initialization\n');
    
    try {
      storage = await StorageFactory.createFromEnv();
      logTest('Storage Initialization', true, `${provider.toUpperCase()} connected successfully`);
    } catch (error) {
      logTest('Storage Initialization', false, error.message);
      return;
    }
    
    console.log('');
    
    // Test 3: Upload file
    console.log('📋 Test 3: File Upload\n');
    
    try {
      const result = await storage.upload(TEST_IMAGE_BUFFER, TEST_FILE_PATH, {
        mimetype: 'image/jpeg'
      });
      
      const success = result && result.success && result.url;
      logTest('Upload File', success, success ? `URL: ${result.url.substring(0, 50)}...` : 'Upload failed');
      
      if (!success) return;
    } catch (error) {
      logTest('Upload File', false, error.message);
      return;
    }
    
    console.log('');
    
    // Test 4: Check file exists
    console.log('📋 Test 4: File Existence Check\n');
    
    try {
      const exists = await storage.exists(TEST_FILE_PATH);
      logTest('File Exists', exists, exists ? 'File found in cloud' : 'File not found');
      
      if (!exists) return;
    } catch (error) {
      logTest('File Exists', false, error.message);
      return;
    }
    
    console.log('');
    
    // Test 5: Get file metadata
    console.log('📋 Test 5: File Metadata\n');
    
    try {
      const metadata = await storage.getMetadata(TEST_FILE_PATH);
      const success = metadata && metadata.size > 0;
      logTest('Get Metadata', success, 
        success ? `Size: ${metadata.size} bytes, Type: ${metadata.contentType || 'N/A'}` : 'Failed to get metadata');
    } catch (error) {
      logTest('Get Metadata', false, error.message);
    }
    
    console.log('');
    
    // Test 6: Download file
    console.log('📋 Test 6: File Download\n');
    
    try {
      const buffer = await storage.download(TEST_FILE_PATH);
      const success = buffer && buffer.length > 0;
      logTest('Download File', success, 
        success ? `Downloaded ${buffer.length} bytes` : 'Download failed');
      
      // Verify content matches
      if (success) {
        const matches = Buffer.compare(buffer, TEST_IMAGE_BUFFER) === 0;
        logTest('Content Verification', matches,
          matches ? 'Downloaded content matches original' : 'Content mismatch');
      }
    } catch (error) {
      logTest('Download File', false, error.message);
    }
    
    console.log('');
    
    // Test 7: Get signed URL
    console.log('📋 Test 7: Signed URL Generation\n');
    
    try {
      const url = await storage.getUrl(TEST_FILE_PATH, 3600);
      const success = url && url.length > 0;
      logTest('Generate URL', success,
        success ? `URL: ${url.substring(0, 50)}...` : 'URL generation failed');
    } catch (error) {
      logTest('Generate URL', false, error.message);
    }
    
    console.log('');
    
    // Test 8: List files
    console.log('📋 Test 8: List Files\n');
    
    try {
      const files = await storage.list(TEST_FOLDER);
      const success = Array.isArray(files) && files.length > 0;
      logTest('List Files', success,
        success ? `Found ${files.length} file(s)` : 'No files found or list failed');
    } catch (error) {
      logTest('List Files', false, error.message);
    }
    
    console.log('');
    
    // Test 9: Copy file
    console.log('📋 Test 9: File Copy\n');
    
    const copyPath = `test/test-photo-copy.jpg`;
    try {
      const success = await storage.copy(TEST_FILE_PATH, copyPath);
      logTest('Copy File', success,
        success ? `Copied to ${copyPath}` : 'Copy failed');
      
      // Clean up copy
      if (success) {
        await storage.delete(copyPath);
      }
    } catch (error) {
      logTest('Copy File', false, error.message);
    }
    
    console.log('');
    
    // Test 10: Delete file
    console.log('📋 Test 10: File Deletion\n');
    
    try {
      const success = await storage.delete(TEST_FILE_PATH);
      logTest('Delete File', success,
        success ? 'File deleted successfully' : 'Delete failed');
      
      // Verify deletion
      if (success) {
        const stillExists = await storage.exists(TEST_FILE_PATH);
        logTest('Verify Deletion', !stillExists,
          !stillExists ? 'File no longer exists' : 'File still exists after deletion');
      }
    } catch (error) {
      logTest('Delete File', false, error.message);
    }
    
    console.log('');
    
    // Test 11: Clean up test folder
    console.log('📋 Test 11: Cleanup\n');
    
    try {
      await storage.deleteDirectory(TEST_FOLDER);
      logTest('Cleanup', true, 'Test folder removed');
    } catch (error) {
      logTest('Cleanup', false, error.message);
    }
    
  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    console.error(error.stack);
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60) + '\n');
  
  const total = results.passed + results.failed;
  const percentage = total > 0 ? Math.round((results.passed / total) * 100) : 0;
  
  console.log(`Total Tests: ${total}`);
  console.log(`Passed: ${results.passed} ✅`);
  console.log(`Failed: ${results.failed} ❌`);
  console.log(`Success Rate: ${percentage}%`);
  console.log('');
  
  if (results.failed === 0) {
    console.log('🎉 All tests passed! Your cloud storage is configured correctly.\n');
    console.log('✅ You can now use cloud storage with PhotoFlow.\n');
    console.log('Next steps:');
    console.log('  1. Start the server: node app-cloud.js');
    console.log('  2. Create an event and upload photos');
    console.log('  3. Verify photos are stored in your cloud provider\n');
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.\n');
    console.log('Common issues:');
    console.log('  - Incorrect credentials in .env file');
    console.log('  - Missing permissions for cloud storage');
    console.log('  - Network connectivity issues');
    console.log('  - Bucket/container does not exist\n');
    console.log('Please fix the issues and run the tests again.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
