/**
 * MEGA Storage Adapter
 * Implements cloud storage using MEGA.nz
 */

const { Storage } = require('megajs');
const CloudStorageAdapter = require('./CloudStorageAdapter');
const { Logger } = require('../utils');
const path = require('path');
const stream = require('stream');
const fetch = require('node-fetch');
const { Readable } = stream;

class MegaStorageAdapter extends CloudStorageAdapter {
  constructor(config) {
    super(config);
    this.storage = null;
    this.logger = new Logger('MegaStorageAdapter');
    this.uploadQueue = [];
    this.isProcessing = false;
    this.MAX_RETRIES = 5;
    this.BASE_RETRY_DELAY = 2000; // Base delay (2 seconds)
    this.MAX_RETRY_DELAY = 30000; // Max delay (30 seconds)
    this.uploadStatus = {};
    this._folderCache = new Map();
  }

  _getRetryDelay(attempt) {
    // Exponential backoff with jitter
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
        if (error.message && error.message.includes('EAGAIN')) {
          const delay = this._getRetryDelay(attempt);
          this.logger.warn(
            `MEGA server congestion (attempt ${attempt + 1}/${maxAttempts}), ` +
            `retrying ${context} in ${Math.round(delay/1000)}s...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Non-retryable error
        throw error;
      }
    }
    
    // If we get here, all retries failed
    throw new Error(
      `Failed ${context} after ${maxAttempts} attempts. ` +
      `Last error: ${lastError.message}`
    );
  }

  async _initializeWithRetry(retryCount = 0) {
    return this._retryOperation(async () => {
      const TIMEOUT = 30000; // 30 seconds

      this.logger.info(`Attempting to initialize MEGA storage (attempt ${retryCount + 1}/${this.MAX_RETRIES + 1})`);
      
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

      try {
        // Initialize storage with timeout
        this.storage = await Promise.race([
          new Storage({
            email: this.email,
            password: this.password,
            fetch: (url, opts = {}) => {
              return fetch(url, {
                ...opts,
                signal: controller.signal,
                timeout: TIMEOUT
              });
            }
          }).ready,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('MEGA initialization timed out')), TIMEOUT)
          )
        ]);

        clearTimeout(timeoutId);
        return true;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    }, 'initializing MEGA storage');
  }

  async initialize() {
    try {
      if (!this.config) {
        throw new Error('Configuration is required');
      }
      
      this.email = process.env.MEGA_EMAIL || this.config.email;
      this.password = process.env.MEGA_PASSWORD || this.config.password;
      
      if (!this.email || !this.password) {
        throw new Error('MEGA email and password are required');
      }

      await this._initializeWithRetry();

      // Get or create root folder for the app
      this.rootFolder = this.storage.root;
      
      this.logger.info(`MEGA Storage initialized for ${this.email}`);
      return true;
    } catch (error) {
      this.logger.error('MEGA initialization failed:', error);
      throw error;
    }
  }

  async _getFolder(folderPath) {
    return this._retryOperation(async () => {
      // Check cache first
      if (this._folderCache.has(folderPath)) {
        return this._folderCache.get(folderPath);
      }

      const parts = folderPath.split('/').filter(p => p);
      let current = this.rootFolder;

      for (const part of parts) {
        // Normalize folder name for case-insensitive comparison
        const normalizedPart = part.toLowerCase();
        
        // Check if folder exists (case-insensitive)
        let found = current.children.find(child => 
          child.directory && 
          child.name.toLowerCase() === normalizedPart
        );
        
        if (!found) {
          // Before creating, double-check after reloading the storage
          await this.storage.reload();
          
          // Re-check after reload
          found = current.children.find(child => 
            child.directory && 
            child.name.toLowerCase() === normalizedPart
          );
          
          if (!found) {
            // Create folder if it still doesn't exist
            this.logger.info(`Creating folder: ${part}`);
            found = await current.mkdir(part);
            // Wait for folder to be created and indexed
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Reload storage to refresh folder structure
            await this.storage.reload();
          }
        }
        
        current = found;
      }

      // Cache the result
      this._folderCache.set(folderPath, current);
      return current;
    }, `getting folder ${folderPath}`);
  }

  // Add to upload queue
  _addToQueue(file, filePath, metadata) {
    return new Promise((resolve, reject) => {
      this.uploadQueue.push({
        file, filePath, metadata, resolve, reject
      });
      this._processQueue();
    });
  }

  // Process queue
  async _processQueue() {
    if (this.isProcessing || this.uploadQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const upload = this.uploadQueue.shift();
    let retries = 0;

    while (retries < this.MAX_RETRIES) {
      try {
        const result = await this._uploadWithRetry(
          upload.file, 
          upload.filePath, 
          upload.metadata,
          retries + 1
        );
        upload.resolve(result);
        this.isProcessing = false;
        this._processQueue();
        return;
      } catch (error) {
        retries++;
        this.logger.error(`Upload failed, attempt ${retries}/${this.MAX_RETRIES}:`, error);
        if (retries === this.MAX_RETRIES) {
          upload.reject(error);
          this.isProcessing = false;
          this._processQueue();
          return;
        }
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
      }
    }
  }

  // Upload with retry logic
  async _uploadWithRetry(file, filePath, metadata, attemptNumber = 1) {
    try {
      const normalized = filePath.replace(/\\/g, '/');
      const folderPath = path.dirname(normalized);
      const fileName = path.basename(normalized);

      // Store upload status
      this.uploadStatus[filePath] = {
        status: 'uploading',
        progress: 0,
        filePath,
        attempt: attemptNumber
      };

      // Ensure storage is fresh
      await this.storage.reload();

      // Get destination folder with improved folder handling
      const folder = await this._getFolder(folderPath);
      
      if (!folder || !folder.children) {
        throw new Error(`Failed to access folder: ${folderPath}`);
      }

      // Check if file already exists
      const existingFile = folder.children.find(child => 
        !child.directory && 
        child.name.toLowerCase() === fileName.toLowerCase()
      );

      if (existingFile) {
        this.logger.info(`File already exists: ${fileName}, skipping upload`);
        this.uploadStatus[filePath].status = 'completed';
        this.uploadStatus[filePath].progress = 100;
        return {
          success: true,
          path: filePath,
          provider: 'mega',
          existed: true
        };
      }
      
      let uploadStream;
      if (Buffer.isBuffer(file)) {
        uploadStream = new stream.Readable();
        uploadStream.push(file);
        uploadStream.push(null);
      } else {
        uploadStream = file;
      }

      this.logger.info(`Uploading ${fileName} to ${folderPath}`);
      const uploadResult = await this.storage.upload({
        name: fileName,
        target: folder,
        size: Buffer.isBuffer(file) ? file.length : null
      }, uploadStream);

      // Update status on success
      this.uploadStatus[filePath].status = 'completed';
      this.uploadStatus[filePath].progress = 100;
      this.logger.info(`Successfully uploaded ${filePath} to MEGA (attempt ${attemptNumber})`);
      
      return {
        success: true,
        path: filePath,
        provider: 'mega'
      };
    } catch (error) {
      // Update status on error
      this.uploadStatus[filePath] = {
        status: 'failed',
        error: error.message,
        filePath,
        attempt: attemptNumber
      };
      
      throw error;
    }
  }

  // Public upload method
  async upload(file, filePath, metadata = {}) {
    return this._addToQueue(file, filePath, metadata);
  }

  // Main upload method
  async upload(file, filePath, metadata = {}) {
    // Calculate file size for tracking
    let fileSize = 0;
    if (Buffer.isBuffer(file)) {
      fileSize = file.length;
    } else if (file.size) {
      fileSize = file.size;
    }

    // Adjust timeout based on file size (1 minute per 5MB with minimum of 5 minutes)
    const timeout = Math.max(this.uploadTimeout, Math.ceil(fileSize / (5 * 1024 * 1024)) * 60 * 1000);
    metadata.timeout = timeout;

    console.log(`📤 Queueing ${filePath} (${(fileSize / (1024 * 1024)).toFixed(2)}MB)`);
    return this._addToQueue(file, filePath, metadata);
  }

  // Summary of upload status
  getUploadStatus() {
    return {
      queued: this.uploadQueue.length,
      retrying: this.retryQueue.length,
      failed: this.failedUploads.size,
      failedFiles: Array.from(this.failedUploads.entries()).map(([file, attempts]) => ({
        file,
        attempts
      }))
    };
  }

  async _findFile(normalizedPath) {
    return this._retryOperation(async () => {
      const parts = normalizedPath.split('/').filter(p => p);
      const fileName = parts.pop(); // Get the file name
      const dirPath = parts.join('/');

      // Get the directory with retries handled by _retryOperation
      const dir = await this._getFolder(dirPath);
      if (!dir) {
        throw new Error(`Directory not found: ${dirPath}`);
      }

      // Find the file (case-insensitive)
      const file = dir.children.find(child => 
        !child.directory && 
        child.name.toLowerCase() === fileName.toLowerCase()
      );

      if (!file) {
        throw new Error(`File not found: ${normalizedPath}`);
      }

      return file;
    }, `finding file ${normalizedPath}`);
  }

  async download(filePath, attemptNumber = 1) {
    try {
      const normalized = filePath.replace(/\\/g, '/');
      
      this.logger.info(`Downloading ${normalized} from MEGA...`);
      
      // Find the file node
      const file = await this._findFile(normalized);
      
      // Create a buffer to store the file data
      const chunks = [];
      
      // Download the file in chunks
      const downloadStream = file.download();
      
      return new Promise((resolve, reject) => {
        downloadStream.on('data', chunk => chunks.push(chunk));
        
        downloadStream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          this.logger.info(`✅ Successfully downloaded ${filePath} from MEGA`);
          resolve(buffer);
        });
        
        downloadStream.on('error', error => {
          if (attemptNumber < this.MAX_RETRIES) {
            this.logger.warn(`Retry ${attemptNumber}/${this.MAX_RETRIES} for downloading ${filePath}`);
            setTimeout(() => {
              this.download(filePath, attemptNumber + 1)
                .then(resolve)
                .catch(reject);
            }, this.RETRY_DELAY);
          } else {
            reject(error);
          }
        });
      });
    } catch (error) {
      this.logger.error(`MEGA download failed for ${filePath}:`, error.message || error);
      
      if (attemptNumber < this.MAX_RETRIES) {
        this.logger.warn(`Retrying download ${attemptNumber}/${this.MAX_RETRIES} for ${filePath}`);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        return this.download(filePath, attemptNumber + 1);
      }
      
      throw error;
    }
  }

  async delete(filePath) {
    try {
      // Normalize path to use forward slashes for MEGA
      const normalizedPath = filePath.replace(/\\/g, '/');
      const dir = path.dirname(normalizedPath).replace(/\\/g, '/');
      const filename = path.basename(normalizedPath);
      
      const folder = await this._getFolder(dir);
      const file = folder.children.find(child => child.name === filename);
      
      if (file) {
        await file.delete();
        console.log(`✅ Deleted from MEGA: ${filePath}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`❌ MEGA delete failed for ${filePath}:`, error);
      return false;
    }
  }

  async list(folderPath) {
    try {
      // Normalize path to use forward slashes for MEGA
      const normalizedPath = folderPath.replace(/\\/g, '/');
      const folder = await this._getFolder(normalizedPath);
      
      return folder.children
        .filter(child => !child.directory)
        .map(file => ({
          name: file.name,
          path: path.join(folderPath, file.name),
          size: file.size,
          lastModified: new Date(file.timestamp * 1000),
          nodeId: file.nodeId
        }));
    } catch (error) {
      console.error(`❌ MEGA list failed for ${folderPath}:`, error);
      return [];
    }
  }

  async getUrl(filePath, expiresIn = 3600) {
    try {
      // Normalize path to use forward slashes for MEGA
      const normalizedPath = filePath.replace(/\\/g, '/');
      const dir = path.dirname(normalizedPath).replace(/\\/g, '/');
      const filename = path.basename(normalizedPath);
      
      const folder = await this._getFolder(dir);
      const file = folder.children.find(child => child.name === filename && !child.directory);
      
      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Add timeout wrapper for slow MEGA link generation
      const linkPromise = file.link();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('MEGA link generation timeout')), 30000)
      );
      
      const url = await Promise.race([linkPromise, timeoutPromise]);
      return url;
    } catch (error) {
      console.error(`❌ MEGA getUrl failed for ${filePath}:`, error.message);
      // Return a placeholder or throw - app-cloud.js should handle this
      throw error;
    }
  }

  async exists(filePath) {
    try {
      // Normalize path to use forward slashes for MEGA
      const normalizedPath = filePath.replace(/\\/g, '/');
      const dir = path.dirname(normalizedPath).replace(/\\/g, '/');
      const filename = path.basename(normalizedPath);
      
      const folder = await this._getFolder(dir);
      const file = folder.children.find(child => child.name === filename);
      
      return !!file;
    } catch (error) {
      return false;
    }
  }

  async copy(sourcePath, destPath) {
    try {
      // Download and re-upload (MEGA doesn't have native copy)
      const data = await this.download(sourcePath);
      await this.upload(data, destPath);
      
      console.log(`✅ Copied in MEGA: ${sourcePath} -> ${destPath}`);
      return true;
    } catch (error) {
      console.error(`❌ MEGA copy failed:`, error);
      return false;
    }
  }

  async move(sourcePath, destPath) {
    try {
      await this.copy(sourcePath, destPath);
      await this.delete(sourcePath);
      return true;
    } catch (error) {
      console.error(`❌ MEGA move failed:`, error);
      return false;
    }
  }

  async getMetadata(filePath) {
    try {
      const dir = path.dirname(filePath);
      const filename = path.basename(filePath);
      
      const folder = await this._getFolder(dir);
      const file = folder.children.find(child => child.name === filename && !child.directory);
      
      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }

      return {
        size: file.size,
        lastModified: new Date(file.timestamp * 1000),
        nodeId: file.nodeId,
        name: file.name
      };
    } catch (error) {
      console.error(`❌ MEGA getMetadata failed for ${filePath}:`, error);
      throw error;
    }
  }

  async deleteDirectory(folderPath) {
    try {
      const folder = await this._getFolder(folderPath);
      await folder.delete(true); // true = permanent delete
      
      console.log(`✅ Deleted directory from MEGA: ${folderPath}`);
      return true;
    } catch (error) {
      console.error(`❌ MEGA deleteDirectory failed for ${folderPath}:`, error);
      return false;
    }
  }
}

module.exports = MegaStorageAdapter;
