/**
 * AWS S3 Storage Adapter
 * Implements cloud storage using Amazon S3
 * Enhanced with retry mechanisms, queue management, and improved error handling
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, 
        ListObjectsV2Command, HeadObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const CloudStorageAdapter = require('./CloudStorageAdapter');
const { Logger } = require('../utils');
const stream = require('stream');

class S3StorageAdapter extends CloudStorageAdapter {
  constructor(config) {
    super(config);
    this.bucket = config.bucket;
    this.region = config.region || 'us-east-1';
    this.client = null;
    this.logger = new Logger('S3StorageAdapter');
    
    // Queue management (similar to MEGA)
    this.uploadQueue = [];
    this.isProcessing = false;
    this.MAX_RETRIES = 5;
    this.BASE_RETRY_DELAY = 2000; // Base delay (2 seconds)
    this.MAX_RETRY_DELAY = 30000; // Max delay (30 seconds)
    this.uploadStatus = {};
    
    // Concurrency control
    this.maxConcurrentUploads = parseInt(process.env.S3_MAX_CONCURRENT_UPLOADS || '5', 10);
    this.activeUploads = 0;
  }

  _getRetryDelay(attempt) {
    // Exponential backoff with jitter (same as MEGA)
    const exponentialDelay = Math.min(
      this.MAX_RETRY_DELAY,
      this.BASE_RETRY_DELAY * Math.pow(2, attempt)
    );
    // Add random jitter (±20%)
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    return exponentialDelay + jitter;
  }

  async _retryOperation(operation, context, maxAttempts = this.MAX_RETRIES) {
    let lastError;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        const isRetryable = this._isRetryableError(error);
        
        if (isRetryable && attempt < maxAttempts - 1) {
          const delay = this._getRetryDelay(attempt);
          this.logger.warn(
            `S3 ${error.name} error (attempt ${attempt + 1}/${maxAttempts}), ` +
            `retrying ${context} in ${Math.round(delay/1000)}s...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Non-retryable error or final attempt
        throw error;
      }
    }
    
    // If we get here, all retries failed
    throw new Error(
      `Failed ${context} after ${maxAttempts} attempts. ` +
      `Last error: ${lastError.message}`
    );
  }

  _isRetryableError(error) {
    // List of retryable S3 errors
    const retryableErrors = [
      'RequestTimeout',
      'RequestTimeTooSkewed',
      'ServiceUnavailable',
      'SlowDown',
      'ThrottlingException',
      'TooManyRequestsException',
      'NetworkingError',
      'TimeoutError',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ENETUNREACH'
    ];
    
    return retryableErrors.some(errType => 
      error.name === errType || 
      error.code === errType || 
      error.message?.includes(errType)
    );
  }

  async initialize() {
    return this._retryOperation(async () => {
      try {
        this.client = new S3Client({
          region: this.region,
          credentials: {
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey
          },
          maxAttempts: 3, // SDK-level retries
          requestHandler: {
            requestTimeout: 120000, // 2 minutes timeout
            httpsAgent: {
              maxSockets: 50 // Increase concurrent connections
            }
          }
        });
        
        // Test connection by listing bucket
        const testCommand = new ListObjectsV2Command({
          Bucket: this.bucket,
          MaxKeys: 1
        });
        await this.client.send(testCommand);
        
        this.logger.info(`S3 Storage initialized: ${this.bucket} (${this.region})`);
        return true;
      } catch (error) {
        this.logger.error('S3 initialization failed:', error);
        throw error;
      }
    }, 'initializing S3 storage');
  }

  // Add to upload queue (similar to MEGA)
  _addToQueue(file, filePath, metadata) {
    return new Promise((resolve, reject) => {
      this.uploadQueue.push({
        file, filePath, metadata, resolve, reject
      });
      this._processQueue();
    });
  }

  // Process queue with concurrency control
  async _processQueue() {
    // Process multiple uploads concurrently
    while (this.uploadQueue.length > 0 && this.activeUploads < this.maxConcurrentUploads) {
      const upload = this.uploadQueue.shift();
      if (!upload) break;
      
      this.activeUploads++;
      
      // Process upload without blocking the queue
      this._uploadWithRetry(upload.file, upload.filePath, upload.metadata)
        .then(result => {
          upload.resolve(result);
        })
        .catch(error => {
          upload.reject(error);
        })
        .finally(() => {
          this.activeUploads--;
          this._processQueue(); // Continue processing queue
        });
    }
  }

  // Upload with retry logic (similar to MEGA)
  async _uploadWithRetry(file, filePath, metadata, attemptNumber = 1) {
    const normalized = filePath.replace(/\\/g, '/');

    // Store upload status
    this.uploadStatus[filePath] = {
      status: 'uploading',
      progress: 0,
      filePath,
      attempt: attemptNumber
    };

    try {
      // Check if file already exists
      const fileExists = await this.exists(normalized);
      
      if (fileExists) {
        this.logger.info(`File already exists: ${normalized}, skipping upload`);
        this.uploadStatus[filePath].status = 'completed';
        this.uploadStatus[filePath].progress = 100;
        return {
          success: true,
          path: filePath,
          provider: 's3',
          existed: true
        };
      }

      // Calculate file size for tracking
      let fileSize = 0;
      if (Buffer.isBuffer(file)) {
        fileSize = file.length;
      } else if (file.size) {
        fileSize = file.size;
      }

      this.logger.info(`Uploading ${normalized} to S3 (${(fileSize / (1024 * 1024)).toFixed(2)}MB)`);

      const params = {
        Bucket: this.bucket,
        Key: normalized,
        Body: file,
        ContentType: metadata.mimetype || 'application/octet-stream',
        Metadata: metadata.customMetadata || {}
      };

      const command = new PutObjectCommand(params);
      
      // Upload with retry
      await this._retryOperation(
        () => this.client.send(command),
        `uploading ${normalized}`
      );

      // Update status on success
      this.uploadStatus[filePath].status = 'completed';
      this.uploadStatus[filePath].progress = 100;
      this.logger.info(`Successfully uploaded ${filePath} to S3 (attempt ${attemptNumber})`);
      
      return {
        success: true,
        path: filePath,
        provider: 's3',
        bucket: this.bucket
      };
    } catch (error) {
      // Update status on error
      this.uploadStatus[filePath] = {
        status: 'failed',
        error: error.message,
        filePath,
        attempt: attemptNumber
      };
      
      this.logger.error(`S3 upload failed for ${filePath}:`, error.message);
      throw error;
    }
  }

  // Public upload method with queue management
  async upload(file, filePath, metadata = {}) {
    // Calculate file size for tracking
    let fileSize = 0;
    if (Buffer.isBuffer(file)) {
      fileSize = file.length;
    } else if (file.size) {
      fileSize = file.size;
    }

    this.logger.info(`📤 Queueing ${filePath} (${(fileSize / (1024 * 1024)).toFixed(2)}MB)`);
    return this._addToQueue(file, filePath, metadata);
  }

  // Get upload status (similar to MEGA)
  getUploadStatus() {
    const completed = Object.values(this.uploadStatus).filter(s => s.status === 'completed').length;
    const failed = Object.values(this.uploadStatus).filter(s => s.status === 'failed').length;
    const uploading = Object.values(this.uploadStatus).filter(s => s.status === 'uploading').length;
    
    return {
      queued: this.uploadQueue.length,
      active: this.activeUploads,
      uploading: uploading,
      completed: completed,
      failed: failed,
      failedFiles: Object.entries(this.uploadStatus)
        .filter(([_, status]) => status.status === 'failed')
        .map(([file, status]) => ({
          file,
          error: status.error,
          attempts: status.attempt
        }))
    };
  }

  async download(path, attemptNumber = 1) {
    const normalized = path.replace(/\\/g, '/');
    
    this.logger.info(`Downloading ${normalized} from S3...`);
    
    return this._retryOperation(async () => {
      try {
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: normalized
        });

        const response = await this.client.send(command);
        
        // Convert stream to buffer
        const chunks = [];
        for await (const chunk of response.Body) {
          chunks.push(chunk);
        }
        
        const buffer = Buffer.concat(chunks);
        this.logger.info(`✅ Successfully downloaded ${normalized} from S3 (${(buffer.length / (1024 * 1024)).toFixed(2)}MB)`);
        return buffer;
      } catch (error) {
        this.logger.error(`S3 download failed for ${normalized}:`, error.message);
        throw error;
      }
    }, `downloading ${normalized}`);
  }

  async delete(path) {
    const normalized = path.replace(/\\/g, '/');
    
    return this._retryOperation(async () => {
      try {
        const command = new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: normalized
        });

        await this.client.send(command);
        this.logger.info(`Deleted from S3: ${normalized}`);
        return true;
      } catch (error) {
        this.logger.error(`S3 delete failed for ${normalized}:`, error.message);
        return false;
      }
    }, `deleting ${normalized}`);
  }

  async list(folderPath, options = {}) {
    const normalized = folderPath.replace(/\\/g, '/');
    const maxResults = options.maxResults || 10000; // Default to 10k max
    
    return this._retryOperation(async () => {
      try {
        let allObjects = [];
        let continuationToken = null;
        
        // Paginate through all objects
        do {
          const command = new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: normalized,
            ContinuationToken: continuationToken,
            MaxKeys: 1000 // S3 max per request
          });

          const response = await this.client.send(command);
          const objects = (response.Contents || []).map(item => ({
            name: item.Key.split('/').pop(),
            path: item.Key,
            size: item.Size,
            lastModified: item.LastModified,
            url: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${item.Key}`
          }));
          
          allObjects = allObjects.concat(objects);
          
          // Check if we've reached the max results limit
          if (allObjects.length >= maxResults) {
            allObjects = allObjects.slice(0, maxResults);
            break;
          }
          
          // Check if there are more objects to list
          continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
          
        } while (continuationToken);
        
        this.logger.info(`Listed ${allObjects.length} objects from S3: ${normalized}`);
        return allObjects;
      } catch (error) {
        this.logger.error(`S3 list failed for ${normalized}:`, error.message);
        return [];
      }
    }, `listing ${normalized}`);
  }

  async getUrl(path, expiresIn = 3600) {
    const normalized = path.replace(/\\/g, '/');
    
    return this._retryOperation(async () => {
      try {
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: normalized
        });

        const url = await getSignedUrl(this.client, command, { expiresIn });
        return url;
      } catch (error) {
        this.logger.warn(`S3 getUrl failed for ${normalized}, returning public URL:`, error.message);
        // Return public URL as fallback
        return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${normalized}`;
      }
    }, `generating URL for ${normalized}`);
  }

  async exists(path) {
    const normalized = path.replace(/\\/g, '/');
    
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: normalized
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        return false;
      }
      // For other errors, log but return false to avoid breaking the flow
      this.logger.warn(`S3 exists check failed for ${normalized}:`, error.message);
      return false;
    }
  }

  async copy(sourcePath, destPath) {
    const normalizedSource = sourcePath.replace(/\\/g, '/');
    const normalizedDest = destPath.replace(/\\/g, '/');
    
    return this._retryOperation(async () => {
      try {
        const command = new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: `${this.bucket}/${normalizedSource}`,
          Key: normalizedDest
        });

        await this.client.send(command);
        this.logger.info(`Copied in S3: ${normalizedSource} -> ${normalizedDest}`);
        return true;
      } catch (error) {
        this.logger.error('S3 copy failed:', error.message);
        return false;
      }
    }, `copying ${normalizedSource} to ${normalizedDest}`);
  }

  async move(sourcePath, destPath) {
    const normalizedSource = sourcePath.replace(/\\/g, '/');
    const normalizedDest = destPath.replace(/\\/g, '/');
    
    try {
      await this.copy(normalizedSource, normalizedDest);
      await this.delete(normalizedSource);
      this.logger.info(`Moved in S3: ${normalizedSource} -> ${normalizedDest}`);
      return true;
    } catch (error) {
      this.logger.error('S3 move failed:', error.message);
      return false;
    }
  }

  async getMetadata(path) {
    const normalized = path.replace(/\\/g, '/');
    
    return this._retryOperation(async () => {
      try {
        const command = new HeadObjectCommand({
          Bucket: this.bucket,
          Key: normalized
        });

        const response = await this.client.send(command);
        
        return {
          size: response.ContentLength,
          contentType: response.ContentType,
          lastModified: response.LastModified,
          etag: response.ETag,
          metadata: response.Metadata
        };
      } catch (error) {
        this.logger.error(`S3 getMetadata failed for ${normalized}:`, error.message);
        throw error;
      }
    }, `getting metadata for ${normalized}`);
  }

  async deleteDirectory(folderPath) {
    const normalized = folderPath.replace(/\\/g, '/');
    
    return this._retryOperation(async () => {
      try {
        this.logger.info(`🗑️  Starting deletion of directory: ${normalized}`);
        
        let totalDeleted = 0;
        let continuationToken = null;
        
        // Paginate through all objects (S3 returns max 1000 per request)
        do {
          const command = new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: normalized,
            ContinuationToken: continuationToken,
            MaxKeys: 1000
          });

          const response = await this.client.send(command);
          const objects = response.Contents || [];
          
          if (objects.length === 0) {
            if (totalDeleted === 0) {
              this.logger.info(`Directory is empty or doesn't exist: ${normalized}`);
            }
            break;
          }
          
          this.logger.info(`📋 Found ${objects.length} objects to delete (batch ${Math.floor(totalDeleted / 1000) + 1})`);
          
          // Delete objects in batches of 1000 (S3 limit for batch delete)
          // We'll use individual deletes with Promise.all for better error handling
          const deletePromises = objects.map(obj => 
            this.delete(obj.Key).catch(err => {
              this.logger.error(`Failed to delete ${obj.Key}:`, err.message);
              return false;
            })
          );
          
          const results = await Promise.all(deletePromises);
          const successCount = results.filter(r => r === true).length;
          totalDeleted += successCount;
          
          this.logger.info(`✅ Deleted ${successCount}/${objects.length} objects from current batch`);
          
          // Check if there are more objects to delete
          continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
          
        } while (continuationToken);
        
        this.logger.info(`🎉 Successfully deleted directory from S3: ${normalized} (${totalDeleted} total files)`);
        return true;
      } catch (error) {
        this.logger.error(`S3 deleteDirectory failed for ${normalized}:`, error.message);
        return false;
      }
    }, `deleting directory ${normalized}`);
  }
}

module.exports = S3StorageAdapter;
