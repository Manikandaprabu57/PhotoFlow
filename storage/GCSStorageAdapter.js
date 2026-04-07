/**
 * Google Cloud Storage Adapter
 * Implements cloud storage using Google Cloud Storage
 */

const { Storage } = require('@google-cloud/storage');
const CloudStorageAdapter = require('./CloudStorageAdapter');

class GCSStorageAdapter extends CloudStorageAdapter {
  constructor(config) {
    super(config);
    this.bucketName = config.bucket;
    this.projectId = config.projectId;
    this.keyFilename = config.keyFilename;
    this.storage = null;
    this.bucket = null;
  }

  async initialize() {
    try {
      const storageConfig = {
        projectId: this.projectId
      };

      if (this.keyFilename) {
        storageConfig.keyFilename = this.keyFilename;
      }

      this.storage = new Storage(storageConfig);
      this.bucket = this.storage.bucket(this.bucketName);
      
      console.log(`✅ Google Cloud Storage initialized: ${this.bucketName}`);
      return true;
    } catch (error) {
      console.error('❌ GCS initialization failed:', error);
      throw error;
    }
  }

  async upload(file, path, metadata = {}) {
    try {
      const blob = this.bucket.file(path);
      
      const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: {
          contentType: metadata.mimetype || 'application/octet-stream',
          metadata: metadata.customMetadata || {}
        }
      });

      return new Promise((resolve, reject) => {
        blobStream.on('error', (error) => {
          console.error(`❌ GCS upload failed for ${path}:`, error);
          reject(error);
        });

        blobStream.on('finish', async () => {
          const url = await this.getUrl(path);
          console.log(`✅ Uploaded to GCS: ${path}`);
          resolve({
            success: true,
            path: path,
            url: url,
            provider: 'gcs',
            bucket: this.bucketName
          });
        });

        if (Buffer.isBuffer(file)) {
          blobStream.end(file);
        } else {
          file.pipe(blobStream);
        }
      });
    } catch (error) {
      console.error(`❌ GCS upload failed for ${path}:`, error);
      throw error;
    }
  }

  async download(path) {
    try {
      const file = this.bucket.file(path);
      const [buffer] = await file.download();
      return buffer;
    } catch (error) {
      console.error(`❌ GCS download failed for ${path}:`, error);
      throw error;
    }
  }

  async delete(path) {
    try {
      const file = this.bucket.file(path);
      await file.delete();
      console.log(`✅ Deleted from GCS: ${path}`);
      return true;
    } catch (error) {
      console.error(`❌ GCS delete failed for ${path}:`, error);
      return false;
    }
  }

  async list(path) {
    try {
      const [files] = await this.bucket.getFiles({
        prefix: path
      });

      return files.map(file => ({
        name: file.name.split('/').pop(),
        path: file.name,
        size: parseInt(file.metadata.size),
        lastModified: new Date(file.metadata.updated),
        url: `https://storage.googleapis.com/${this.bucketName}/${file.name}`
      }));
    } catch (error) {
      console.error(`❌ GCS list failed for ${path}:`, error);
      return [];
    }
  }

  async getUrl(path, expiresIn = 3600) {
    try {
      const file = this.bucket.file(path);
      
      // Generate signed URL
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expiresIn * 1000
      });

      return url;
    } catch (error) {
      console.error(`❌ GCS getUrl failed for ${path}:`, error);
      // Return public URL as fallback
      return `https://storage.googleapis.com/${this.bucketName}/${path}`;
    }
  }

  async exists(path) {
    try {
      const file = this.bucket.file(path);
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      return false;
    }
  }

  async copy(sourcePath, destPath) {
    try {
      const sourceFile = this.bucket.file(sourcePath);
      const destFile = this.bucket.file(destPath);
      
      await sourceFile.copy(destFile);
      console.log(`✅ Copied in GCS: ${sourcePath} -> ${destPath}`);
      return true;
    } catch (error) {
      console.error(`❌ GCS copy failed:`, error);
      return false;
    }
  }

  async move(sourcePath, destPath) {
    try {
      const sourceFile = this.bucket.file(sourcePath);
      const destFile = this.bucket.file(destPath);
      
      await sourceFile.move(destFile);
      console.log(`✅ Moved in GCS: ${sourcePath} -> ${destPath}`);
      return true;
    } catch (error) {
      console.error(`❌ GCS move failed:`, error);
      return false;
    }
  }

  async getMetadata(path) {
    try {
      const file = this.bucket.file(path);
      const [metadata] = await file.getMetadata();
      
      return {
        size: parseInt(metadata.size),
        contentType: metadata.contentType,
        lastModified: new Date(metadata.updated),
        etag: metadata.etag,
        metadata: metadata.metadata
      };
    } catch (error) {
      console.error(`❌ GCS getMetadata failed for ${path}:`, error);
      throw error;
    }
  }

  async deleteDirectory(path) {
    try {
      const [files] = await this.bucket.getFiles({
        prefix: path
      });

      // Delete all files in the directory
      await Promise.all(files.map(file => file.delete()));
      
      console.log(`✅ Deleted directory from GCS: ${path}`);
      return true;
    } catch (error) {
      console.error(`❌ GCS deleteDirectory failed for ${path}:`, error);
      return false;
    }
  }
}

module.exports = GCSStorageAdapter;
