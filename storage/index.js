/**
 * Storage Module Entry Point
 * Exports all storage-related classes and utilities
 */

const CloudStorageAdapter = require('./CloudStorageAdapter');
const S3StorageAdapter = require('./S3StorageAdapter');
const MegaStorageAdapter = require('./MegaStorageAdapter');
const GCSStorageAdapter = require('./GCSStorageAdapter');
const GoogleDriveStorageAdapter = require('./GoogleDriveStorageAdapter');
const StorageFactory = require('./StorageFactory');
const { CloudStorageEngine, createCloudMulter } = require('./CloudStorageMulter');

module.exports = {
  CloudStorageAdapter,
  S3StorageAdapter,
  MegaStorageAdapter,
  GCSStorageAdapter,
  GoogleDriveStorageAdapter,
  StorageFactory,
  CloudStorageEngine,
  createCloudMulter
};
