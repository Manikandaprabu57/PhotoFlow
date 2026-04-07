# Cloud Storage Integration Guide

This guide explains how to configure and use cloud storage with PhotoFlow. The application supports **AWS S3**, **MEGA**, **Google Cloud Storage**, and **local storage**.

## 🌟 Features

- **Multi-Cloud Support**: Works with AWS S3, MEGA, Google Cloud Storage
- **Automatic Sync**: Photos uploaded to cloud are synced locally for face recognition processing
- **Bi-directional Sync**: Matched photos are synced back to cloud after processing
- **Seamless Fallback**: If cloud storage fails, automatically falls back to local storage
- **Real-time Updates**: All UI changes reflect in cloud storage immediately

## 📋 Table of Contents

1. [AWS S3 Setup](#aws-s3-setup)
2. [MEGA Setup](#mega-setup)
3. [Google Cloud Storage Setup](#google-cloud-storage-setup)
4. [Environment Configuration](#environment-configuration)
5. [Running with Cloud Storage](#running-with-cloud-storage)
6. [How It Works](#how-it-works)
7. [Troubleshooting](#troubleshooting)

---

## 🔧 AWS S3 Setup

### Prerequisites
- AWS Account
- S3 Bucket created
- IAM User with S3 access

### Steps

1. **Create an S3 Bucket**
   - Go to AWS Console → S3
   - Click "Create bucket"
   - Choose a unique bucket name (e.g., `photoflow-storage`)
   - Select your preferred region
   - Configure bucket settings as needed
   - Create the bucket

2. **Create IAM User**
   - Go to AWS Console → IAM → Users
   - Click "Add users"
   - Enter username (e.g., `photoflow-app`)
   - Select "Access key - Programmatic access"
   - Click "Next: Permissions"

3. **Attach Permissions**
   - Click "Attach existing policies directly"
   - Search and select `AmazonS3FullAccess` (or create a custom policy)
   - Click "Next" and "Create user"
   - **Save the Access Key ID and Secret Access Key**

4. **Configure Environment Variables**
   ```env
   # AWS S3 Configuration
   CLOUD_STORAGE_PROVIDER=s3
   AWS_S3_BUCKET=your-bucket-name
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your-access-key-id
   AWS_SECRET_ACCESS_KEY=your-secret-access-key
   ```

### Custom IAM Policy (Recommended)

For better security, use a custom policy with minimal permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

---

## 🔧 MEGA Setup

### Prerequisites
- MEGA account (free or paid)

### Steps

1. **Create MEGA Account**
   - Go to https://mega.nz
   - Sign up for a free account (50GB free storage)
   - Verify your email

2. **Configure Environment Variables**
   ```env
   # MEGA Configuration
   CLOUD_STORAGE_PROVIDER=mega
   MEGA_EMAIL=your-email@example.com
   MEGA_PASSWORD=your-mega-password
   ```

### Notes
- Free MEGA accounts have bandwidth limits
- For production use, consider a paid MEGA plan
- MEGA automatically creates folders as needed

---

## 🔧 Google Cloud Storage Setup

### Prerequisites
- Google Cloud Platform account
- GCS Bucket created
- Service Account with GCS access

### Steps

1. **Create a GCS Bucket**
   - Go to Google Cloud Console → Cloud Storage
   - Click "Create bucket"
   - Choose a unique bucket name
   - Select location and storage class
   - Create the bucket

2. **Create Service Account**
   - Go to IAM & Admin → Service Accounts
   - Click "Create Service Account"
   - Enter name and description
   - Click "Create and Continue"

3. **Grant Permissions**
   - Add role: `Storage Object Admin`
   - Click "Continue" and "Done"

4. **Create Key**
   - Click on the service account
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Choose JSON format
   - Download the key file
   - Save it as `gcs-key.json` in your project root

5. **Configure Environment Variables**
   ```env
   # Google Cloud Storage Configuration
   CLOUD_STORAGE_PROVIDER=gcs
   GCS_BUCKET=your-bucket-name
   GCS_PROJECT_ID=your-project-id
   GCS_KEY_FILENAME=./gcs-key.json
   ```

---

## ⚙️ Environment Configuration

Create or update your `.env` file with the following variables:

### Required for All Setups
```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/photoflow

# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_ENABLED=true

# Server Configuration
PORT=5000
BASE_URL=http://localhost:5000
MAX_UPLOAD_MB=1024
PROCESS_TIMEOUT_MS=900000
```

### Cloud Storage Configuration

**For AWS S3:**
```env
CLOUD_STORAGE_PROVIDER=s3
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

**For MEGA:**
```env
CLOUD_STORAGE_PROVIDER=mega
MEGA_EMAIL=your-email@example.com
MEGA_PASSWORD=your-mega-password
```

**For Google Cloud Storage:**
```env
CLOUD_STORAGE_PROVIDER=gcs
GCS_BUCKET=your-bucket-name
GCS_PROJECT_ID=your-project-id
GCS_KEY_FILENAME=./gcs-key.json
```

**For Local Storage (Default):**
```env
CLOUD_STORAGE_PROVIDER=local
# or simply don't set CLOUD_STORAGE_PROVIDER
```

---

## 🚀 Running with Cloud Storage

### 1. Install Dependencies

```bash
npm install
```

This will install all required cloud storage packages:
- `@aws-sdk/client-s3` - AWS S3 SDK
- `@aws-sdk/s3-request-presigner` - S3 URL signing
- `megajs` - MEGA SDK
- `@google-cloud/storage` - Google Cloud Storage SDK

### 2. Start the Server

**Option A: Use the cloud-enabled version**
```bash
node app-cloud.js
```

**Option B: Replace the original app.js**
```bash
# Backup original
cp app.js app-local.js

# Use cloud version
cp app-cloud.js app.js

# Start normally
npm start
```

### 3. Verify Cloud Storage

When the server starts, you should see:
```
☁️  Initializing S3 cloud storage...
✅ Cloud storage ready: S3
🚀 PhotoFlow Server Started Successfully!
☁️  Cloud Storage:   S3
```

---

## 🔄 How It Works

### Upload Flow

1. **User uploads photos** (selfies or event photos)
2. **Photos are uploaded to cloud storage** (S3/MEGA/GCS)
3. **Photos are synced to local storage** for face recognition processing
4. **Face recognition runs** on local files
5. **Matched photos are synced back to cloud storage**
6. **Zip files are created** and uploaded to cloud
7. **Users download** from cloud storage (with fallback to local)

### Folder Structure

Both cloud and local storage maintain the same structure:

```
events/
├── {eventName}/
│   ├── photos/              # All event photos
│   ├── selfies/             # Guest selfies
│   │   └── {email}/
│   ├── matched/             # Matched photos per guest
│   │   └── {email}/
│   ├── exports/             # Generated zip files
│   │   └── {email}.zip
│   └── qr-code.png          # Event QR code
```

### Sync Behavior

- **Upload**: Files go to cloud first, then sync to local
- **Processing**: Face recognition uses local files
- **Results**: Matched photos sync back to cloud
- **Download**: Serves from cloud with local fallback

---

## 🐛 Troubleshooting

### AWS S3 Issues

**Error: "Access Denied"**
- Verify IAM user has correct permissions
- Check bucket policy allows your IAM user
- Ensure AWS credentials are correct in `.env`

**Error: "Bucket does not exist"**
- Verify bucket name is correct
- Check you're using the correct AWS region
- Ensure bucket is in the specified region

**Error: "Invalid credentials"**
- Regenerate AWS access keys
- Check for extra spaces in `.env` file
- Verify keys are not expired

### MEGA Issues

**Error: "Login failed"**
- Verify email and password are correct
- Check if account is verified
- Try logging in via web to confirm credentials

**Error: "Bandwidth limit exceeded"**
- Free MEGA accounts have bandwidth limits
- Wait for limit to reset or upgrade account
- Consider using AWS S3 or GCS for production

### Google Cloud Storage Issues

**Error: "Could not load credentials"**
- Verify `gcs-key.json` file exists
- Check file path in `GCS_KEY_FILENAME`
- Ensure service account has correct permissions

**Error: "Bucket not found"**
- Verify bucket name is correct
- Check project ID matches
- Ensure service account has access to bucket

### General Issues

**Server falls back to local storage**
- Check cloud provider credentials
- Verify network connectivity
- Review server logs for specific errors

**Photos not syncing**
- Check disk space on server
- Verify write permissions
- Review cloud storage quotas

**Slow uploads**
- Check network bandwidth
- Consider using a closer cloud region
- Optimize image sizes before upload

---

## 📊 API Endpoints

### Check Cloud Storage Status

```http
GET /api/cloud-storage-status
```

Response:
```json
{
  "enabled": true,
  "provider": "s3",
  "initialized": true
}
```

### All existing endpoints work with cloud storage

The following endpoints automatically use cloud storage when enabled:
- `POST /api/upload-event-photos/:eventName`
- `POST /api/upload-selfie/:eventName`
- `GET /api/event-photos/:eventName`
- `GET /api/guest-photos/:eventName/:guestEmail`
- `GET /download/:eventName/:email`

---

## 💡 Best Practices

1. **Use Environment Variables**: Never hardcode credentials
2. **Enable HTTPS**: Use SSL certificates for production
3. **Set Bucket Policies**: Restrict access to your application only
4. **Monitor Costs**: Track cloud storage usage and costs
5. **Backup Regularly**: Keep backups of important data
6. **Use CDN**: Consider CloudFront (AWS) or Cloud CDN (GCP) for faster delivery
7. **Implement Lifecycle Policies**: Auto-delete old files to save costs

---

## 🔐 Security Recommendations

1. **AWS S3**:
   - Enable bucket encryption
   - Use IAM roles instead of access keys when possible
   - Enable CloudTrail for audit logging
   - Set up bucket versioning

2. **MEGA**:
   - Use strong, unique password
   - Enable two-factor authentication
   - Don't share account credentials

3. **Google Cloud Storage**:
   - Rotate service account keys regularly
   - Use least privilege principle
   - Enable audit logging
   - Set up VPC Service Controls

---

## 📈 Performance Tips

1. **Choose the right region**: Select cloud region closest to your users
2. **Use multipart uploads**: For large files (handled automatically)
3. **Implement caching**: Cache frequently accessed files
4. **Optimize images**: Compress images before upload
5. **Use CDN**: Distribute content globally for faster access

---

## 🆘 Support

If you encounter issues:

1. Check server logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test cloud credentials independently
4. Review cloud provider documentation
5. Check network connectivity and firewall rules

---

## 📝 License

This cloud storage integration is part of PhotoFlow and follows the same license as the main application.
