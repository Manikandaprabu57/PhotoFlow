/**
 * AWS S3 Storage Test Script
 * Tests all S3 storage operations to verify configuration
 */

require('dotenv').config();
const { StorageFactory } = require('./storage');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_FILE_CONTENT = Buffer.from('Test file content for PhotoFlow S3 integration');
const TEST_FILE_PATH = 'test/photoflow-test-file.txt';
const TEST_FILE_PATH_2 = 'test/photoflow-test-file-copy.txt';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  log(`🧪 Testing: ${name}`, 'cyan');
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

async function testS3Storage() {
  let storage = null;
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Header
    console.log('\n');
    log('╔════════════════════════════════════════════════════╗', 'cyan');
    log('║       AWS S3 Storage Integration Test Suite        ║', 'cyan');
    log('╚════════════════════════════════════════════════════╝', 'cyan');
    console.log('\n');

    // Verify environment variables
    logTest('Environment Configuration');
    
    const requiredVars = [
      'CLOUD_STORAGE_PROVIDER',
      'AWS_S3_BUCKET',
      'AWS_REGION',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY'
    ];

    let configValid = true;
    for (const varName of requiredVars) {
      if (process.env[varName]) {
        logSuccess(`${varName}: ${varName.includes('SECRET') ? '***hidden***' : process.env[varName]}`);
      } else {
        logError(`${varName}: Missing`);
        configValid = false;
      }
    }

    if (!configValid) {
      logError('Configuration incomplete. Please check your .env file.');
      process.exit(1);
    }

    if (process.env.CLOUD_STORAGE_PROVIDER !== 's3') {
      logWarning(`CLOUD_STORAGE_PROVIDER is set to '${process.env.CLOUD_STORAGE_PROVIDER}'`);
      logWarning('For S3 testing, it should be set to "s3"');
    }

    testsPassed++;

    // Test 1: Initialize Storage
    logTest('Storage Initialization');
    try {
      storage = await StorageFactory.createFromEnv();
      logSuccess('Storage factory created');
      logInfo(`Provider: ${storage.provider || 's3'}`);
      logInfo(`Bucket: ${storage.bucket}`);
      logInfo(`Region: ${storage.region}`);
      testsPassed++;
    } catch (error) {
      logError(`Initialization failed: ${error.message}`);
      logInfo('Make sure your AWS credentials are correct and have proper permissions');
      testsFailed++;
      throw error;
    }

    // Test 2: Upload File
    logTest('File Upload');
    try {
      const result = await storage.upload(
        TEST_FILE_CONTENT,
        TEST_FILE_PATH,
        { mimetype: 'text/plain' }
      );
      logSuccess('File uploaded successfully');
      logInfo(`Path: ${result.path}`);
      logInfo(`Provider: ${result.provider}`);
      testsPassed++;
    } catch (error) {
      logError(`Upload failed: ${error.message}`);
      testsFailed++;
    }

    // Test 3: Check File Exists
    logTest('File Existence Check');
    try {
      const exists = await storage.exists(TEST_FILE_PATH);
      if (exists) {
        logSuccess('File exists in storage');
      } else {
        logError('File does not exist (but upload succeeded?)');
        testsFailed++;
      }
      testsPassed++;
    } catch (error) {
      logError(`Exists check failed: ${error.message}`);
      testsFailed++;
    }

    // Test 4: Get File Metadata
    logTest('File Metadata');
    try {
      const metadata = await storage.getMetadata(TEST_FILE_PATH);
      logSuccess('Metadata retrieved');
      logInfo(`Size: ${metadata.size} bytes`);
      logInfo(`Content-Type: ${metadata.contentType}`);
      logInfo(`Last Modified: ${metadata.lastModified}`);
      testsPassed++;
    } catch (error) {
      logError(`Metadata retrieval failed: ${error.message}`);
      testsFailed++;
    }

    // Test 5: Generate Signed URL
    logTest('Signed URL Generation');
    try {
      const url = await storage.getUrl(TEST_FILE_PATH, 3600);
      logSuccess('Signed URL generated');
      logInfo(`URL: ${url.substring(0, 60)}...`);
      logInfo(`Expires in: 3600 seconds`);
      testsPassed++;
    } catch (error) {
      logError(`URL generation failed: ${error.message}`);
      testsFailed++;
    }

    // Test 6: Download File
    logTest('File Download');
    try {
      const downloaded = await storage.download(TEST_FILE_PATH);
      if (downloaded.equals(TEST_FILE_CONTENT)) {
        logSuccess('File downloaded successfully');
        logInfo(`Size: ${downloaded.length} bytes`);
        logInfo('Content matches original');
      } else {
        logError('Downloaded content does not match original');
        testsFailed++;
      }
      testsPassed++;
    } catch (error) {
      logError(`Download failed: ${error.message}`);
      testsFailed++;
    }

    // Test 7: List Files
    logTest('List Files');
    try {
      const files = await storage.list('test/');
      logSuccess(`Found ${files.length} file(s) in test/ directory`);
      files.forEach(file => {
        logInfo(`- ${file.name} (${file.size} bytes)`);
      });
      testsPassed++;
    } catch (error) {
      logError(`List operation failed: ${error.message}`);
      testsFailed++;
    }

    // Test 8: Copy File
    logTest('File Copy');
    try {
      const copied = await storage.copy(TEST_FILE_PATH, TEST_FILE_PATH_2);
      if (copied) {
        logSuccess('File copied successfully');
        logInfo(`From: ${TEST_FILE_PATH}`);
        logInfo(`To: ${TEST_FILE_PATH_2}`);
      } else {
        logError('Copy operation returned false');
        testsFailed++;
      }
      testsPassed++;
    } catch (error) {
      logError(`Copy failed: ${error.message}`);
      testsFailed++;
    }

    // Test 9: Verify Copy
    logTest('Verify Copied File');
    try {
      const exists = await storage.exists(TEST_FILE_PATH_2);
      if (exists) {
        logSuccess('Copied file exists');
      } else {
        logError('Copied file does not exist');
        testsFailed++;
      }
      testsPassed++;
    } catch (error) {
      logError(`Verification failed: ${error.message}`);
      testsFailed++;
    }

    // Test 10: Upload Queue Status (S3 specific)
    logTest('Upload Queue Status');
    try {
      if (typeof storage.getUploadStatus === 'function') {
        const status = storage.getUploadStatus();
        logSuccess('Upload queue status retrieved');
        logInfo(`Queued: ${status.queued}`);
        logInfo(`Active: ${status.active}`);
        logInfo(`Completed: ${status.completed}`);
        logInfo(`Failed: ${status.failed}`);
      } else {
        logWarning('Upload queue status not available for this adapter');
      }
      testsPassed++;
    } catch (error) {
      logError(`Queue status check failed: ${error.message}`);
      testsFailed++;
    }

    // Test 11: Delete Copied File
    logTest('Delete Copied File');
    try {
      const deleted = await storage.delete(TEST_FILE_PATH_2);
      if (deleted) {
        logSuccess('Copied file deleted successfully');
      } else {
        logError('Delete operation returned false');
        testsFailed++;
      }
      testsPassed++;
    } catch (error) {
      logError(`Delete failed: ${error.message}`);
      testsFailed++;
    }

    // Test 12: Delete Original File
    logTest('Delete Original File');
    try {
      const deleted = await storage.delete(TEST_FILE_PATH);
      if (deleted) {
        logSuccess('Original file deleted successfully');
      } else {
        logError('Delete operation returned false');
        testsFailed++;
      }
      testsPassed++;
    } catch (error) {
      logError(`Delete failed: ${error.message}`);
      testsFailed++;
    }

    // Test 13: Verify Deletion
    logTest('Verify File Deletion');
    try {
      const exists = await storage.exists(TEST_FILE_PATH);
      if (!exists) {
        logSuccess('File successfully deleted (does not exist)');
      } else {
        logError('File still exists after deletion');
        testsFailed++;
      }
      testsPassed++;
    } catch (error) {
      logError(`Verification failed: ${error.message}`);
      testsFailed++;
    }

    // Test 14: Cleanup - Delete Test Directory
    logTest('Cleanup Test Directory');
    try {
      const deleted = await storage.deleteDirectory('test/');
      if (deleted) {
        logSuccess('Test directory cleaned up');
      } else {
        logWarning('Directory cleanup returned false (may be empty)');
      }
      testsPassed++;
    } catch (error) {
      logError(`Cleanup failed: ${error.message}`);
      testsFailed++;
    }

    // Summary
    console.log('\n');
    log('╔════════════════════════════════════════════════════╗', 'cyan');
    log('║                   Test Summary                     ║', 'cyan');
    log('╚════════════════════════════════════════════════════╝', 'cyan');
    console.log('\n');

    const total = testsPassed + testsFailed;
    const passRate = ((testsPassed / total) * 100).toFixed(1);

    logInfo(`Total Tests: ${total}`);
    logSuccess(`Passed: ${testsPassed}`);
    if (testsFailed > 0) {
      logError(`Failed: ${testsFailed}`);
    } else {
      logSuccess(`Failed: ${testsFailed}`);
    }
    logInfo(`Pass Rate: ${passRate}%`);

    console.log('\n');

    if (testsFailed === 0) {
      log('🎉 All tests passed! Your S3 storage is configured correctly.', 'green');
      log('✅ You can now use S3 storage in your PhotoFlow application.', 'green');
      process.exit(0);
    } else {
      log('⚠️  Some tests failed. Please check the errors above.', 'yellow');
      log('💡 Common issues:', 'yellow');
      log('   - Incorrect AWS credentials', 'yellow');
      log('   - Insufficient IAM permissions', 'yellow');
      log('   - Bucket does not exist or wrong name', 'yellow');
      log('   - Wrong AWS region configured', 'yellow');
      log('   - Network connectivity issues', 'yellow');
      process.exit(1);
    }

  } catch (error) {
    console.log('\n');
    logError(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
log('\n🚀 Starting AWS S3 Storage Tests...', 'cyan');
log('This will test your S3 configuration and operations.\n', 'blue');

testS3Storage().catch(error => {
  logError(`Test suite failed: ${error.message}`);
  process.exit(1);
});
