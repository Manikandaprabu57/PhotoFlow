const { StorageFactory } = require('./storage');
require('dotenv').config();

async function testGoogleDriveStorage() {
  try {
    // Initialize storage
    process.env.CLOUD_STORAGE_PROVIDER = 'gdrive';
    const storage = await StorageFactory.createFromEnv();

    // Create a test file
    const testContent = 'This is a test file for Google Drive storage';
    const testBuffer = Buffer.from(testContent);
    
    // Test upload
    console.log('Testing upload...');
    const uploadResult = await storage.upload(testBuffer, 'test/test-file.txt', {
      mimetype: 'text/plain',
      customMetadata: {
        testKey: 'testValue'
      }
    });
    console.log('Upload successful:', uploadResult);

    // Test download
    console.log('\nTesting download...');
    const downloaded = await storage.download('test/test-file.txt');
    console.log('Download successful:', downloaded.toString() === testContent);

    // Test delete
    console.log('\nTesting delete...');
    const deleteResult = await storage.delete('test/test-file.txt');
    console.log('Delete successful:', deleteResult);

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testGoogleDriveStorage().catch(console.error);