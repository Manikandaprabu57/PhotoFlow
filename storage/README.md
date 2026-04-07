# Cloud Storage Module

A modular, extensible cloud storage abstraction layer for PhotoFlow that supports multiple cloud providers.

## 📁 Module Structure

```
storage/
├── CloudStorageAdapter.js      # Abstract base class
├── S3StorageAdapter.js         # AWS S3 implementation
├── MegaStorageAdapter.js       # MEGA implementation
├── GCSStorageAdapter.js        # Google Cloud Storage implementation
├── StorageFactory.js           # Factory for creating adapters
├── CloudStorageMulter.js       # Multer integration
├── index.js                    # Module exports
└── README.md                   # This file
```

## 🎯 Features

- **Provider Agnostic**: Works with AWS S3, MEGA, Google Cloud Storage, and more
- **Unified API**: Same interface for all cloud providers
- **Easy Integration**: Drop-in replacement for local file storage
- **Multer Support**: Custom storage engine for Express file uploads
- **Extensible**: Easy to add new cloud providers
- **Type Safe**: Consistent error handling and return types

## 🚀 Quick Start

### Basic Usage

```javascript
const { StorageFactory } = require('./storage');

// Create from environment variables
const storage = await StorageFactory.createFromEnv();

// Upload a file
const result = await storage.upload(
  fileBuffer, 
  'events/myevent/photos/photo1.jpg',
  { mimetype: 'image/jpeg' }
);

console.log(result.url); // Public URL to the file

// Download a file
const buffer = await storage.download('events/myevent/photos/photo1.jpg');

// Delete a file
await storage.delete('events/myevent/photos/photo1.jpg');

// List files
const files = await storage.list('events/myevent/photos/');

// Get signed URL
const url = await storage.getUrl('events/myevent/photos/photo1.jpg', 3600);
```

### With Multer

```javascript
const { createCloudMulter } = require('./storage');

// Create multer instance with cloud storage
const upload = createCloudMulter(storage);

// Use in Express routes
app.post('/upload', upload.array('photos', 10), (req, res) => {
  // Files are automatically uploaded to cloud
  res.json({ 
    files: req.files.map(f => ({
      url: f.url,
      path: f.cloudPath
    }))
  });
});
```

## 📚 API Reference

### CloudStorageAdapter (Base Class)

All storage adapters implement these methods:

#### `initialize()`
Initialize the storage provider connection.

```javascript
await storage.initialize();
```

#### `upload(file, path, metadata)`
Upload a file to cloud storage.

**Parameters:**
- `file` (Buffer|Stream): File data
- `path` (string): Destination path in cloud storage
- `metadata` (Object): Optional metadata (mimetype, customMetadata, etc.)

**Returns:** `Promise<Object>`
```javascript
{
  success: true,
  path: 'events/myevent/photo.jpg',
  url: 'https://...',
  provider: 's3'
}
```

#### `download(path)`
Download a file from cloud storage.

**Parameters:**
- `path` (string): File path in cloud storage

**Returns:** `Promise<Buffer>`

#### `delete(path)`
Delete a file from cloud storage.

**Parameters:**
- `path` (string): File path in cloud storage

**Returns:** `Promise<boolean>`

#### `list(path)`
List files in a directory.

**Parameters:**
- `path` (string): Directory path

**Returns:** `Promise<Array>`
```javascript
[
  {
    name: 'photo1.jpg',
    path: 'events/myevent/photos/photo1.jpg',
    size: 1024567,
    lastModified: Date,
    url: 'https://...'
  }
]
```

#### `getUrl(path, expiresIn)`
Get a signed/public URL for a file.

**Parameters:**
- `path` (string): File path in cloud storage
- `expiresIn` (number): URL expiration time in seconds (default: 3600)

**Returns:** `Promise<string>`

#### `exists(path)`
Check if a file exists.

**Parameters:**
- `path` (string): File path in cloud storage

**Returns:** `Promise<boolean>`

#### `copy(sourcePath, destPath)`
Copy a file within cloud storage.

**Parameters:**
- `sourcePath` (string): Source file path
- `destPath` (string): Destination file path

**Returns:** `Promise<boolean>`

#### `move(sourcePath, destPath)`
Move a file within cloud storage.

**Parameters:**
- `sourcePath` (string): Source file path
- `destPath` (string): Destination file path

**Returns:** `Promise<boolean>`

#### `getMetadata(path)`
Get file metadata.

**Parameters:**
- `path` (string): File path in cloud storage

**Returns:** `Promise<Object>`
```javascript
{
  size: 1024567,
  contentType: 'image/jpeg',
  lastModified: Date,
  etag: '...',
  metadata: {}
}
```

#### `deleteDirectory(path)`
Delete a directory and all its contents.

**Parameters:**
- `path` (string): Directory path

**Returns:** `Promise<boolean>`

### StorageFactory

Factory class for creating storage adapters.

#### `create(provider, config)`
Create a storage adapter for a specific provider.

**Parameters:**
- `provider` (string): Provider name ('s3', 'mega', 'gcs')
- `config` (Object): Provider-specific configuration

**Returns:** `Promise<CloudStorageAdapter>`

```javascript
const storage = await StorageFactory.create('s3', {
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: '...',
  secretAccessKey: '...'
});
```

#### `createFromEnv()`
Create a storage adapter from environment variables.

**Returns:** `Promise<CloudStorageAdapter>`

```javascript
// Reads CLOUD_STORAGE_PROVIDER and provider-specific env vars
const storage = await StorageFactory.createFromEnv();
```

#### `register(name, AdapterClass)`
Register a custom storage adapter.

**Parameters:**
- `name` (string): Adapter name
- `AdapterClass` (Class): Adapter class extending CloudStorageAdapter

```javascript
StorageFactory.register('dropbox', DropboxStorageAdapter);
```

## 🔧 Provider-Specific Configuration

### AWS S3

```javascript
const storage = await StorageFactory.create('s3', {
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
});
```

**Environment Variables:**
```env
CLOUD_STORAGE_PROVIDER=s3
AWS_S3_BUCKET=my-bucket
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

### MEGA

```javascript
const storage = await StorageFactory.create('mega', {
  email: 'user@example.com',
  password: 'password123'
});
```

**Environment Variables:**
```env
CLOUD_STORAGE_PROVIDER=mega
MEGA_EMAIL=user@example.com
MEGA_PASSWORD=password123
```

### Google Cloud Storage

```javascript
const storage = await StorageFactory.create('gcs', {
  bucket: 'my-bucket',
  projectId: 'my-project',
  keyFilename: './gcs-key.json'
});
```

**Environment Variables:**
```env
CLOUD_STORAGE_PROVIDER=gcs
GCS_BUCKET=my-bucket
GCS_PROJECT_ID=my-project
GCS_KEY_FILENAME=./gcs-key.json
```

## 🔌 Creating Custom Adapters

Extend `CloudStorageAdapter` to add support for new cloud providers:

```javascript
const CloudStorageAdapter = require('./CloudStorageAdapter');

class DropboxStorageAdapter extends CloudStorageAdapter {
  constructor(config) {
    super(config);
    this.accessToken = config.accessToken;
  }

  async initialize() {
    // Initialize Dropbox client
    this.client = new Dropbox({ accessToken: this.accessToken });
    console.log('✅ Dropbox Storage initialized');
    return true;
  }

  async upload(file, path, metadata = {}) {
    // Implement upload logic
    const result = await this.client.filesUpload({
      path: '/' + path,
      contents: file
    });
    
    return {
      success: true,
      path: path,
      url: result.url,
      provider: 'dropbox'
    };
  }

  // Implement other required methods...
}

// Register the adapter
StorageFactory.register('dropbox', DropboxStorageAdapter);

// Use it
const storage = await StorageFactory.create('dropbox', {
  accessToken: 'your-token'
});
```

## 🧪 Testing

```javascript
// Test upload
const testBuffer = Buffer.from('Hello World');
const result = await storage.upload(testBuffer, 'test/hello.txt', {
  mimetype: 'text/plain'
});
console.log('Uploaded:', result.url);

// Test download
const downloaded = await storage.download('test/hello.txt');
console.log('Downloaded:', downloaded.toString());

// Test list
const files = await storage.list('test/');
console.log('Files:', files);

// Test delete
await storage.delete('test/hello.txt');
console.log('Deleted');
```

## 🐛 Error Handling

All methods throw errors that should be caught:

```javascript
try {
  await storage.upload(file, path);
} catch (error) {
  if (error.code === 'NoSuchBucket') {
    console.error('Bucket does not exist');
  } else if (error.code === 'AccessDenied') {
    console.error('Permission denied');
  } else {
    console.error('Upload failed:', error.message);
  }
}
```

## 📊 Performance Considerations

1. **Streaming**: Use streams for large files to reduce memory usage
2. **Parallel Uploads**: Upload multiple files concurrently
3. **Caching**: Cache frequently accessed files
4. **Compression**: Compress files before upload
5. **CDN**: Use CDN for serving public files

## 🔐 Security Best Practices

1. **Never commit credentials**: Use environment variables
2. **Use IAM roles**: When possible (AWS)
3. **Least privilege**: Grant minimum required permissions
4. **Rotate keys**: Regularly rotate access keys
5. **Encrypt data**: Enable encryption at rest and in transit

## 📝 License

This module is part of PhotoFlow and follows the same license.
