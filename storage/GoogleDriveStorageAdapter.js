/**
 * Google Drive Storage Adapter
 * Implements cloud storage using Google Drive (service account recommended)
 */

const { google } = require('googleapis');
const CloudStorageAdapter = require('./CloudStorageAdapter');
const stream = require('stream');
const path = require('path');

class GoogleDriveStorageAdapter extends CloudStorageAdapter {
  constructor(config) {
    super(config);
    this.folderId = config.folderId || null; // optional root folder id inside Drive
    this.keyFilename = config.keyFilename; // service account JSON
    this.credentials = config.credentials; // alternative to keyFilename
    this.userEmail = config.userEmail || process.env.GDRIVE_USER_EMAIL; // user who will own the files
    if (!this.userEmail) {
      throw new Error('User email is required for Google Drive storage (GDRIVE_USER_EMAIL)');
    }
    this.drive = null;
    this.provider = 'gdrive';
  }

  async initialize() {
    try {
      let credentials;

      if (process.env.GDRIVE_PRIVATE_KEY && process.env.GDRIVE_CLIENT_EMAIL) {
        credentials = {
          client_email: process.env.GDRIVE_CLIENT_EMAIL,
          private_key: process.env.GDRIVE_PRIVATE_KEY,
          project_id: process.env.GDRIVE_PROJECT_ID
        };
      } else if (this.credentials) {
        credentials = this.credentials;
      } else {
        throw new Error('No Google Drive credentials provided. Set GDRIVE_PRIVATE_KEY and GDRIVE_CLIENT_EMAIL in environment');
      }

      const auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/drive'],
        this.userEmail || process.env.GDRIVE_USER_EMAIL
      );

      this.drive = google.drive({ version: 'v3', auth });
      console.log('\u2705 Google Drive initialized');
      return true;
    } catch (error) {
      console.error('\u274c Google Drive initialization failed:', error.message || error);
      throw error;
    }
  }

  // Ensure folder path exists under the configured root; returns folderId
  async _ensureFolder(folderPath) {
    const parts = folderPath.split('/').filter(Boolean);
    let parent = this.folderId || 'root';

    for (const part of parts) {
      // Search for folder with this name under parent
      const listParams = {
        q: `name='${part.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parent}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive'
      };

      const res = await this.drive.files.list(listParams);

      let folder = res.data.files && res.data.files[0];
      if (!folder) {
        const createParams = {
          requestBody: {
            name: part,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parent]
          },
          fields: 'id',
          supportsAllDrives: true
        };

        if (this.driveId) {
          createParams.requestBody.driveId = this.driveId;
        }

        const created = await this.drive.files.create(createParams);
        folder = { id: created.data.id, name: part };
      }
      parent = folder.id;
    }

    return parent;
  }

  async upload(file, filePath, metadata = {}) {
    try {
      const normalized = filePath.replace(/\\/g, '/');
      const dir = path.dirname(normalized);
      const filename = path.basename(normalized);

      const folderId = await this._ensureFolder(dir);

      const media = {
        mimeType: metadata.mimetype || 'application/octet-stream',
        body: (Buffer.isBuffer(file)) ? stream.Readable.from(file) : file
      };

      // Create file owned by the user to avoid service account storage quota
      const createParams = {
        requestBody: {
          name: filename,
          parents: [folderId],
          // store some metadata in appProperties for easier lookup
          appProperties: metadata.customMetadata || {},
          // Transfer ownership to the user's account to use their storage quota
          permissionIds: [this.userEmail],
          // This ensures the file counts against the user's quota, not service account
          quotaUser: this.userEmail
        },
        media,
        fields: 'id, name, permissions'
      };

      const res = await this.drive.files.create(createParams);
      
      // Set the user as the owner
      await this.drive.permissions.create({
        fileId: res.data.id,
        requestBody: {
          role: 'owner',
          type: 'user',
          emailAddress: this.userEmail
        },
        transferOwnership: true
      });

      return {
        success: true,
        path: filePath,
        url: `https://drive.google.com/uc?id=${res.data.id}`,
        provider: 'gdrive',
        id: res.data.id
      };
    } catch (error) {
      console.error(`\u274c Google Drive upload failed for ${filePath}:`, error.message || error);
      throw error;
    }
  }

  async _findFileByPath(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const dir = path.dirname(normalized);
    const filename = path.basename(normalized);

    const parentId = await this._ensureFolder(dir);

    const res = await this.drive.files.list({
      q: `name='${filename.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, modifiedTime)',
      spaces: 'drive'
    });

    return res.data.files && res.data.files[0];
  }

  async download(filePath) {
    try {
      const file = await this._findFileByPath(filePath);
      if (!file) throw new Error('File not found');

      const res = await this.drive.files.get({
        fileId: file.id,
        alt: 'media'
      }, { responseType: 'stream' });

      const chunks = [];
      return await new Promise((resolve, reject) => {
        res.data.on('data', c => chunks.push(c));
        res.data.on('end', () => resolve(Buffer.concat(chunks)));
        res.data.on('error', reject);
      });
    } catch (error) {
      console.error(`\u274c Google Drive download failed for ${filePath}:`, error.message || error);
      throw error;
    }
  }

  async delete(filePath) {
    try {
      const file = await this._findFileByPath(filePath);
      if (!file) return false;

      await this.drive.files.delete({ fileId: file.id });
      return true;
    } catch (error) {
      console.error(`\u274c Google Drive delete failed for ${filePath}:`, error.message || error);
      return false;
    }
  }

  async list(folderPath) {
    try {
      const folderId = await this._ensureFolder(folderPath);
      const res = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, size, modifiedTime)'
      });

      return (res.data.files || []).map(f => ({
        name: f.name,
        path: path.join(folderPath, f.name),
        size: parseInt(f.size || 0, 10),
        lastModified: f.modifiedTime,
        id: f.id
      }));
    } catch (error) {
      console.error(`\u274c Google Drive list failed for ${folderPath}:`, error.message || error);
      return [];
    }
  }

  async getUrl(filePath, expiresIn = 3600) {
    try {
      const file = await this._findFileByPath(filePath);
      if (!file) throw new Error('File not found');

      // Make the file publicly accessible temporarily by creating a permission
      await this.drive.permissions.create({
        fileId: file.id,
        requestBody: { role: 'reader', type: 'anyone' }
      });

      return `https://drive.google.com/uc?id=${file.id}`;
    } catch (error) {
      console.error(`\u274c Google Drive getUrl failed for ${filePath}:`, error.message || error);
      throw error;
    }
  }

  async exists(filePath) {
    try {
      const file = await this._findFileByPath(filePath);
      return !!file;
    } catch (error) {
      return false;
    }
  }

  async copy(sourcePath, destPath) {
    try {
      const source = await this._findFileByPath(sourcePath);
      if (!source) throw new Error('Source not found');

      const destDir = path.dirname(destPath);
      const destFolderId = await this._ensureFolder(destDir);

      const res = await this.drive.files.copy({
        fileId: source.id,
        requestBody: {
          name: path.basename(destPath),
          parents: [destFolderId]
        },
        fields: 'id'
      });

      return !!res.data.id;
    } catch (error) {
      console.error('\u274c Google Drive copy failed:', error.message || error);
      return false;
    }
  }

  async move(sourcePath, destPath) {
    try {
      const source = await this._findFileByPath(sourcePath);
      if (!source) throw new Error('Source not found');

      const destDir = path.dirname(destPath);
      const destFolderId = await this._ensureFolder(destDir);

      // Update file's parents and name
      await this.drive.files.update({
        fileId: source.id,
        addParents: destFolderId,
        removeParents: source.parents,
        requestBody: { name: path.basename(destPath) }
      });

      return true;
    } catch (error) {
      console.error('\u274c Google Drive move failed:', error.message || error);
      return false;
    }
  }

  async getMetadata(filePath) {
    try {
      const file = await this._findFileByPath(filePath);
      if (!file) throw new Error('File not found');

      const res = await this.drive.files.get({ fileId: file.id, fields: 'id, name, size, mimeType, modifiedTime, appProperties' });
      return {
        id: res.data.id,
        name: res.data.name,
        size: parseInt(res.data.size || 0, 10),
        contentType: res.data.mimeType,
        lastModified: res.data.modifiedTime,
        metadata: res.data.appProperties || {}
      };
    } catch (error) {
      console.error(`\u274c Google Drive getMetadata failed for ${filePath}:`, error.message || error);
      throw error;
    }
  }

  async deleteDirectory(folderPath) {
    try {
      const folderId = await this._ensureFolder(folderPath);
      // Delete folder and all children recursively via Drive API isn't straightforward; list children and delete
      const listRes = await this.drive.files.list({ q: `'${folderId}' in parents and trashed=false`, fields: 'files(id, mimeType)' });
      for (const f of listRes.data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          await this.deleteDirectory(path.join(folderPath, f.name));
        } else {
          await this.drive.files.delete({ fileId: f.id });
        }
      }
      // Finally delete the folder itself (if not root)
      if (folderId !== (this.folderId || 'root')) {
        await this.drive.files.delete({ fileId: folderId });
      }
      return true;
    } catch (error) {
      console.error(`\u274c Google Drive deleteDirectory failed for ${folderPath}:`, error.message || error);
      return false;
    }
  }
}

module.exports = GoogleDriveStorageAdapter;
