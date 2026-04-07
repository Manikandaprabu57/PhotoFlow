/**
 * Storage Factory
 * Creates and manages cloud storage adapters based on configuration
 */

const S3StorageAdapter = require('./S3StorageAdapter');
const MegaStorageAdapter = require('./MegaStorageAdapter');
const GCSStorageAdapter = require('./GCSStorageAdapter');
const GoogleDriveStorageAdapter = require('./GoogleDriveStorageAdapter');
const { Logger } = require('../utils');

class StorageFactory {
  static logger = new Logger('StorageFactory');
  
  static adapters = {
    's3': S3StorageAdapter,
    'aws': S3StorageAdapter,
    'mega': MegaStorageAdapter,
    'gcs': GCSStorageAdapter,
    'google': GCSStorageAdapter,
    'gdrive': GoogleDriveStorageAdapter,
    'googledrive': GoogleDriveStorageAdapter
  };

  /**
   * Create a storage adapter based on provider
   * @param {string} provider - Storage provider name (s3, mega, gcs)
   * @param {Object} config - Provider-specific configuration
   * @returns {CloudStorageAdapter} Initialized storage adapter
   */
  static async create(provider, config) {
    if (!provider) {
      throw new Error('Provider is required');
    }

    const normalizedProvider = provider.toLowerCase();
    
    if (!this.adapters[normalizedProvider]) {
      throw new Error(`Unsupported storage provider: ${provider}. Supported: ${Object.keys(this.adapters).join(', ')}`);
    }

    const AdapterClass = this.adapters[normalizedProvider];
    
    this.logger.info(`Creating storage adapter for ${provider}`);
    
    const adapter = new AdapterClass(config);
    await adapter.initialize();
    
    return adapter;
  }

  /**
   * Create storage adapter from environment variables
   * @returns {CloudStorageAdapter} Initialized storage adapter
   */
  static async createFromEnv() {
    const provider = process.env.CLOUD_STORAGE_PROVIDER;
    
    if (!provider || provider === 'local') {
      this.logger.info('Using local storage (no cloud provider configured)');
      return null;
    }

    const normalizedProvider = provider.toLowerCase();
    let config = {
      provider: normalizedProvider // Set the provider in the config
    };

    switch (normalizedProvider) {
      case 'mega':
        config = {
          email: process.env.MEGA_EMAIL,
          password: process.env.MEGA_PASSWORD
        };
        
        if (!config.email || !config.password) {
          throw new Error('Missing MEGA configuration. Required: MEGA_EMAIL, MEGA_PASSWORD');
        }
        break;

      case 'gdrive':
      case 'googledrive':
        config = {
          credentials: {
            client_email: process.env.GDRIVE_CLIENT_EMAIL,
            private_key: process.env.GDRIVE_PRIVATE_KEY,
            project_id: process.env.GDRIVE_PROJECT_ID
          },
          folderId: process.env.GDRIVE_ROOT_FOLDER_ID,
          userEmail: process.env.GDRIVE_USER_EMAIL
        };

        if (!process.env.GDRIVE_CLIENT_EMAIL || !process.env.GDRIVE_PRIVATE_KEY) {
          throw new Error('Missing Google Drive configuration. Required: GDRIVE_CLIENT_EMAIL and GDRIVE_PRIVATE_KEY');
        }
        if (!config.folderId) {
          throw new Error('Missing Google Drive configuration. Required: GDRIVE_ROOT_FOLDER_ID');
        }
        break;

      case 'gcs':
      case 'google':
        config = {
          projectId: process.env.GCS_PROJECT_ID,
          keyFilename: process.env.GCS_KEY_FILE,
          bucket: process.env.GCS_BUCKET
        };
        
        if (!config.projectId || !config.bucket) {
          throw new Error('Missing GCS configuration. Required: GCS_PROJECT_ID, GCS_BUCKET');
        }
        break;

      case 's3':
      case 'aws':
        config = {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1',
          bucket: process.env.AWS_S3_BUCKET
        };
        
        if (!config.accessKeyId || !config.secretAccessKey || !config.bucket) {
          throw new Error('Missing AWS S3 configuration. Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET');
        }
        break;

      default:
        throw new Error(`Unknown storage provider: ${provider}`);
    }

    // Add provider to config
    config.provider = normalizedProvider;

    return this.create(normalizedProvider, config);
  }

  /**
   * Register a custom storage adapter
   * @param {string} name - Adapter name
   * @param {Class} AdapterClass - Adapter class
   */
  static register(name, AdapterClass) {
    this.adapters[name.toLowerCase()] = AdapterClass;
    console.log(`✅ Registered custom storage adapter: ${name}`);
  }
}

module.exports = StorageFactory;
