/**
 * Cloud Storage Adapter - Abstract Base Class
 * Provides a unified interface for different cloud storage providers
 */

class CloudStorageAdapter {
  constructor(config) {
    this.config = config;
    this.provider = config.provider || 'local';
  }

  /**
   * Initialize the storage provider
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Upload a file to cloud storage
   * @param {Buffer|Stream} file - File data
   * @param {string} path - Destination path in cloud storage
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Upload result with URL and metadata
   */
  async upload(file, path, metadata = {}) {
    throw new Error('upload() must be implemented by subclass');
  }

  /**
   * Download a file from cloud storage
   * @param {string} path - File path in cloud storage
   * @returns {Promise<Buffer|Stream>} File data
   */
  async download(path) {
    throw new Error('download() must be implemented by subclass');
  }

  /**
   * Delete a file from cloud storage
   * @param {string} path - File path in cloud storage
   * @returns {Promise<boolean>} Success status
   */
  async delete(path) {
    throw new Error('delete() must be implemented by subclass');
  }

  /**
   * List files in a directory
   * @param {string} path - Directory path
   * @returns {Promise<Array>} List of files
   */
  async list(path) {
    throw new Error('list() must be implemented by subclass');
  }

  /**
   * Get a signed/public URL for a file
   * @param {string} path - File path in cloud storage
   * @param {number} expiresIn - URL expiration time in seconds
   * @returns {Promise<string>} Public URL
   */
  async getUrl(path, expiresIn = 3600) {
    throw new Error('getUrl() must be implemented by subclass');
  }

  /**
   * Check if a file exists
   * @param {string} path - File path in cloud storage
   * @returns {Promise<boolean>} Existence status
   */
  async exists(path) {
    throw new Error('exists() must be implemented by subclass');
  }

  /**
   * Copy a file within cloud storage
   * @param {string} sourcePath - Source file path
   * @param {string} destPath - Destination file path
   * @returns {Promise<boolean>} Success status
   */
  async copy(sourcePath, destPath) {
    throw new Error('copy() must be implemented by subclass');
  }

  /**
   * Move a file within cloud storage
   * @param {string} sourcePath - Source file path
   * @param {string} destPath - Destination file path
   * @returns {Promise<boolean>} Success status
   */
  async move(sourcePath, destPath) {
    throw new Error('move() must be implemented by subclass');
  }

  /**
   * Get file metadata
   * @param {string} path - File path in cloud storage
   * @returns {Promise<Object>} File metadata
   */
  async getMetadata(path) {
    throw new Error('getMetadata() must be implemented by subclass');
  }

  /**
   * Delete a directory and all its contents
   * @param {string} path - Directory path
   * @returns {Promise<boolean>} Success status
   */
  async deleteDirectory(path) {
    throw new Error('deleteDirectory() must be implemented by subclass');
  }
}

module.exports = CloudStorageAdapter;
