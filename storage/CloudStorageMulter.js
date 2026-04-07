/**
 * Cloud Storage Multer Integration
 * Custom multer storage engine for cloud storage
 */

const multer = require('multer');
const path = require('path');

class CloudStorageEngine {
  constructor(storageAdapter, options = {}) {
    this.storageAdapter = storageAdapter;
    this.options = options;
    this.uploadCount = 0;
    this.uploadDelay = options.uploadDelay || 500; // 500ms delay between uploads for MEGA
  }

  _handleFile(req, file, cb) {
    const { eventName } = req.params;
    const { email } = req.body;
    
    // Determine destination path
    let folderPath;
    if (req.route.path.includes('selfie') && email) {
      folderPath = `events/${eventName}/selfies/${email}`;
    } else {
      folderPath = `events/${eventName}/photos`;
    }

    // Sanitize filename
    const sanitizedFilename = this._sanitizeFilename(file.originalname);
    const filename = `${Date.now()}_${sanitizedFilename}`;
    const filePath = `${folderPath}/${filename}`;

    console.log(`☁️  Uploading to cloud: ${filePath}`);

    // Collect file data
    const chunks = [];
    
    file.stream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    file.stream.on('error', (error) => {
      console.error(`❌ Stream error for ${filename}:`, error);
      cb(error);
    });

    file.stream.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        
        // Add small delay between uploads to avoid overwhelming MEGA
        if (this.uploadCount > 0 && this.storageAdapter.provider === 'mega') {
          await new Promise(resolve => setTimeout(resolve, this.uploadDelay));
        }
        this.uploadCount++;
        
        // Upload to cloud storage
        const result = await this.storageAdapter.upload(buffer, filePath, {
          mimetype: file.mimetype,
          originalname: file.originalname,
          size: buffer.length,
          customMetadata: {
            eventName: eventName,
            email: email || 'photographer',
            uploadedAt: new Date().toISOString()
          }
        });

        console.log(`✅ Cloud upload complete: ${filename}`);

        // ALSO write to local immediately (don't rely on req.files sync)
        const path = require('path');
        const fs = require('fs');
        const localBasePath = path.join(__dirname, '..', 'events');
        let localPath;
        
        if (req.route.path.includes('selfie') && email) {
          localPath = path.join(localBasePath, eventName, 'selfies', email, filename);
        } else {
          localPath = path.join(localBasePath, eventName, 'photos', filename);
        }
        
        const localDir = path.dirname(localPath);
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
        }
        fs.writeFileSync(localPath, buffer);
        console.log(`💾 Saved to local: ${filename}`);

        // Return file info
        cb(null, {
          path: result.path,
          url: result.url,
          size: buffer.length,
          filename: filename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          provider: result.provider,
          cloudPath: result.path
        });
      } catch (error) {
        console.error(`❌ Cloud upload failed for ${filename}:`, error);
        cb(error);
      }
    });
  }

  _removeFile(req, file, cb) {
    // Delete file from cloud storage
    this.storageAdapter.delete(file.cloudPath || file.path)
      .then(() => {
        console.log(`🗑️  Removed from cloud: ${file.path}`);
        cb(null);
      })
      .catch((error) => {
        console.error(`❌ Failed to remove from cloud: ${file.path}`, error);
        cb(error);
      });
  }

  _sanitizeFilename(filename) {
    // Remove email patterns
    let sanitized = filename.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
    // Remove invalid characters
    sanitized = sanitized.replace(/[\\/:*?"<>|]/g, '_');
    // Remove extra underscores
    sanitized = sanitized.replace(/_+/g, '_').replace(/^_|_$/g, '');
    // Ensure we have something left
    if (!sanitized || sanitized === '_') {
      sanitized = 'photo';
    }
    return sanitized;
  }
}

/**
 * Create multer instance with cloud storage
 * @param {CloudStorageAdapter} storageAdapter - Cloud storage adapter
 * @param {Object} options - Multer options
 * @returns {multer} Configured multer instance
 */
function createCloudMulter(storageAdapter, options = {}) {
  const storage = new CloudStorageEngine(storageAdapter, options);
  
  const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '1024', 10);
  const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB > 0 ? MAX_UPLOAD_MB * 1024 * 1024 : undefined;

  return multer({
    storage: storage,
    limits: MAX_UPLOAD_BYTES ? { fileSize: MAX_UPLOAD_BYTES } : undefined,
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed!'));
      }
    }
  });
}

module.exports = {
  CloudStorageEngine,
  createCloudMulter
};
