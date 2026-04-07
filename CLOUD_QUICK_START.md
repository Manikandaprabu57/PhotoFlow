# Cloud Storage Quick Start Guide

Get your PhotoFlow application running with cloud storage in minutes!

## 🚀 Quick Setup

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Choose Your Cloud Provider

Pick one of the following options:

#### Option A: AWS S3 (Recommended for Production)

1. Create an S3 bucket in AWS Console
2. Create IAM user with S3 access
3. Copy `.env.example` to `.env`
4. Add these lines to `.env`:

```env
CLOUD_STORAGE_PROVIDER=s3
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

#### Option B: MEGA (Easiest Setup)

1. Create a free MEGA account at https://mega.nz
2. Copy `.env.example` to `.env`
3. Add these lines to `.env`:

```env
CLOUD_STORAGE_PROVIDER=mega
MEGA_EMAIL=your-email@example.com
MEGA_PASSWORD=your-password
```

#### Option C: Google Cloud Storage

1. Create a GCS bucket in Google Cloud Console
2. Create a service account and download JSON key
3. Save key as `gcs-key.json` in project root
4. Copy `.env.example` to `.env`
5. Add these lines to `.env`:

```env
CLOUD_STORAGE_PROVIDER=gcs
GCS_BUCKET=your-bucket-name
GCS_PROJECT_ID=your-project-id
GCS_KEY_FILENAME=./gcs-key.json
```

#### Option D: Local Storage (No Cloud)

Just leave `CLOUD_STORAGE_PROVIDER` empty or set to `local`:

```env
CLOUD_STORAGE_PROVIDER=local
```

### Step 3: Configure Other Settings

Add these required settings to your `.env`:

```env
MONGODB_URI=mongodb://localhost:27017/photoflow
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
EMAIL_ENABLED=true
PORT=5000
BASE_URL=http://localhost:5000
```

### Step 4: Start the Server

```bash
node app-cloud.js
```

Or replace the original app.js:

```bash
cp app.js app-local.js
cp app-cloud.js app.js
npm start
```

### Step 5: Verify

You should see:

```
☁️  Initializing S3 cloud storage...
✅ Cloud storage ready: S3
🚀 PhotoFlow Server Started Successfully!
☁️  Cloud Storage:   S3
```

## 🎯 What Works with Cloud Storage

✅ **Everything!** All features work seamlessly:

- Upload event photos → Stored in cloud
- Upload guest selfies → Stored in cloud
- Face recognition processing → Uses local copies
- Matched photos → Synced back to cloud
- Download photos → Served from cloud
- Delete photos → Removed from cloud
- View photos in UI → Loaded from cloud

## 🔄 How Sync Works

```
User Upload → Cloud Storage → Local Sync → Face Recognition
                    ↑                              ↓
User Download ← Cloud Storage ← Local Sync ← Matched Photos
```

1. **Upload**: Files go to cloud first
2. **Sync Down**: Cloud files sync to local for processing
3. **Process**: Face recognition runs on local files
4. **Sync Up**: Matched photos sync back to cloud
5. **Download**: Users get files from cloud

## 📊 Check Status

Visit: `http://localhost:5000/api/cloud-storage-status`

Response:
```json
{
  "enabled": true,
  "provider": "s3",
  "initialized": true
}
```

## 🐛 Troubleshooting

### Cloud storage not working?

1. **Check credentials**: Verify all environment variables are correct
2. **Check logs**: Look for error messages in server console
3. **Test connection**: Try uploading a test file
4. **Fallback**: Server automatically falls back to local storage if cloud fails

### Common Issues

**AWS S3 "Access Denied"**
- Check IAM permissions
- Verify bucket name and region

**MEGA "Login failed"**
- Verify email and password
- Check account is verified

**GCS "Credentials error"**
- Verify JSON key file path
- Check service account permissions

## 💡 Pro Tips

1. **Start with MEGA**: Easiest to set up, 50GB free
2. **Use S3 for production**: Most reliable and scalable
3. **Keep local backup**: Local files are kept as backup
4. **Monitor usage**: Check cloud storage costs regularly
5. **Test thoroughly**: Upload and download test files first

## 📚 Need More Help?

- Full documentation: `CLOUD_STORAGE_SETUP.md`
- Environment template: `.env.example`
- Original app (local only): `app.js`
- Cloud-enabled app: `app-cloud.js`

## 🎉 You're Ready!

Your PhotoFlow application now uses cloud storage. All photos are automatically backed up and accessible from anywhere!

---

**Next Steps:**
1. Create your first event
2. Upload some photos
3. Test guest selfie upload
4. Run face recognition
5. Download matched photos

Everything will be stored in your cloud provider! 🚀
