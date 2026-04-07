# PhotoFlow Cloud Storage - Complete Installation Guide

This guide walks you through the complete installation and setup process for PhotoFlow with cloud storage support.

## 📋 Prerequisites

Before you begin, ensure you have:

- ✅ **Node.js** (v14 or higher) - [Download](https://nodejs.org/)
- ✅ **MongoDB** (local or cloud) - [Download](https://www.mongodb.com/try/download/community)
- ✅ **Python 3** (for face recognition) - [Download](https://www.python.org/downloads/)
- ✅ **Git** (optional) - [Download](https://git-scm.com/)
- ✅ **Cloud Storage Account** (AWS/MEGA/GCS) - Optional, can use local storage

## 🚀 Step-by-Step Installation

### Step 1: Get the Code

If you already have the code, skip to Step 2.

```bash
# Clone or navigate to your project directory
cd "e:\photoAi1 - Copy"
```

### Step 2: Install Node.js Dependencies

```bash
npm install
```

This installs all required packages including cloud storage SDKs.

**Expected output:**
```
added 150+ packages in 30s
```

### Step 3: Install Python Dependencies

```bash
python -m pip install -r requirements.txt
```

Or use the setup script:
```bash
npm run setup
```

**Required Python packages:**
- deepface
- tensorflow
- opencv-python
- numpy

### Step 4: Set Up MongoDB

**Option A: Local MongoDB**

1. Install MongoDB Community Edition
2. Start MongoDB service:
   ```bash
   # Windows
   net start MongoDB
   
   # Linux/Mac
   sudo systemctl start mongod
   ```

**Option B: MongoDB Atlas (Cloud)**

1. Create free account at https://www.mongodb.com/cloud/atlas
2. Create a cluster
3. Get connection string

### Step 5: Configure Environment Variables

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file with your settings:**

   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/photoflow
   
   # Email (Gmail)
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-gmail-app-password
   EMAIL_ENABLED=true
   
   # Server
   PORT=5000
   BASE_URL=http://localhost:5000
   MAX_UPLOAD_MB=1024
   PROCESS_TIMEOUT_MS=900000
   
   # Cloud Storage (choose one or use local)
   CLOUD_STORAGE_PROVIDER=local
   ```

### Step 6: Set Up Gmail App Password (for emails)

1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" and your device
3. Click "Generate"
4. Copy the 16-character password
5. Add to `.env` as `EMAIL_PASS`

### Step 7: Choose and Configure Cloud Storage

#### Option A: AWS S3 (Recommended for Production)

1. **Create AWS Account** (if you don't have one)
   - Go to https://aws.amazon.com
   - Sign up for free tier

2. **Create S3 Bucket:**
   - Go to AWS Console → S3
   - Click "Create bucket"
   - Enter bucket name (e.g., `photoflow-storage-yourname`)
   - Choose region (e.g., `us-east-1`)
   - Keep default settings
   - Click "Create bucket"

3. **Create IAM User:**
   - Go to AWS Console → IAM → Users
   - Click "Add users"
   - Username: `photoflow-app`
   - Access type: ✅ Programmatic access
   - Click "Next: Permissions"

4. **Attach Policy:**
   - Click "Attach existing policies directly"
   - Search for `AmazonS3FullAccess`
   - Select it
   - Click "Next" → "Create user"

5. **Save Credentials:**
   - Copy **Access Key ID**
   - Copy **Secret Access Key**
   - ⚠️ Save these securely - you won't see them again!

6. **Update `.env`:**
   ```env
   CLOUD_STORAGE_PROVIDER=s3
   AWS_S3_BUCKET=photoflow-storage-yourname
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   ```

#### Option B: MEGA (Easiest Setup)

1. **Create MEGA Account:**
   - Go to https://mega.nz
   - Click "Create Account"
   - Enter email and password
   - Verify email

2. **Update `.env`:**
   ```env
   CLOUD_STORAGE_PROVIDER=mega
   MEGA_EMAIL=your-email@example.com
   MEGA_PASSWORD=your-mega-password
   ```

That's it! MEGA is ready to use.

#### Option C: Google Cloud Storage

1. **Create GCP Account:**
   - Go to https://cloud.google.com
   - Sign up (free $300 credit)

2. **Create Project:**
   - Go to Console → Select/Create Project
   - Enter project name
   - Note the Project ID

3. **Create GCS Bucket:**
   - Go to Cloud Storage → Buckets
   - Click "Create"
   - Enter bucket name
   - Choose location
   - Click "Create"

4. **Create Service Account:**
   - Go to IAM & Admin → Service Accounts
   - Click "Create Service Account"
   - Name: `photoflow-storage`
   - Click "Create and Continue"

5. **Grant Permissions:**
   - Role: `Storage Object Admin`
   - Click "Continue" → "Done"

6. **Create Key:**
   - Click on the service account
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Choose JSON
   - Click "Create"
   - Save file as `gcs-key.json` in project root

7. **Update `.env`:**
   ```env
   CLOUD_STORAGE_PROVIDER=gcs
   GCS_BUCKET=your-bucket-name
   GCS_PROJECT_ID=your-project-id
   GCS_KEY_FILENAME=./gcs-key.json
   ```

#### Option D: Local Storage (No Cloud)

Just leave the default:
```env
CLOUD_STORAGE_PROVIDER=local
```

### Step 8: Test Cloud Storage Configuration

```bash
npm run test:cloud
```

**Expected output:**
```
🧪 Cloud Storage Test Suite
✅ PASS - Environment Check
✅ PASS - Storage Initialization
✅ PASS - Upload File
✅ PASS - File Exists
✅ PASS - Get Metadata
✅ PASS - Download File
✅ PASS - Content Verification
✅ PASS - Generate URL
✅ PASS - List Files
✅ PASS - Copy File
✅ PASS - Delete File
✅ PASS - Cleanup

🎉 All tests passed!
```

If tests fail, review the error messages and check your configuration.

### Step 9: Start the Server

**With Cloud Storage:**
```bash
npm run start:cloud
```

**With Local Storage:**
```bash
npm start
```

**Expected output:**
```
☁️  Initializing S3 cloud storage...
✅ Cloud storage ready: S3
✅ MongoDB connected
✅ Email transporter is ready
🚀 PhotoFlow Server Started Successfully!
📍 Local Access:    http://localhost:5000
🌐 Network Access:  http://192.168.1.100:5000
☁️  Cloud Storage:   S3
```

### Step 10: Verify Installation

1. **Open browser:**
   ```
   http://localhost:5000
   ```

2. **Register an account:**
   - Click "Register"
   - Enter name, email, phone
   - Click "Register"

3. **Login:**
   - Enter email
   - Request OTP
   - Enter OTP from email
   - Click "Login"

4. **Create test event:**
   - Click "Create Event"
   - Enter event name (e.g., "Test Event")
   - Enter your email
   - Click "Create"

5. **Upload test photos:**
   - Select the event
   - Click "Upload Photos"
   - Select 2-3 test photos
   - Upload

6. **Verify cloud storage:**
   - Check your cloud provider (S3/MEGA/GCS)
   - You should see: `events/Test Event/photos/`
   - Your uploaded photos should be there

7. **Test guest upload:**
   - Scan QR code or copy guest link
   - Enter email
   - Upload a selfie
   - Check cloud: `events/Test Event/selfies/{email}/`

8. **Process event:**
   - Click "Process Event"
   - Wait for face recognition to complete
   - Check cloud: `events/Test Event/matched/{email}/`

9. **Download photos:**
   - Click "Download Photos"
   - Verify zip file downloads correctly

## 🎉 Installation Complete!

Your PhotoFlow application is now fully installed and configured with cloud storage!

## 📚 Next Steps

### For Development

```bash
# Start in development mode (auto-reload)
npm run dev:cloud

# Run tests
npm run test:cloud

# Check logs
# Logs appear in console
```

### For Production

1. **Set up HTTPS:**
   - Use nginx or Apache as reverse proxy
   - Install SSL certificate (Let's Encrypt)

2. **Update BASE_URL:**
   ```env
   BASE_URL=https://yourdomain.com
   ```

3. **Use process manager:**
   ```bash
   npm install -g pm2
   pm2 start app-cloud.js --name photoflow
   pm2 save
   pm2 startup
   ```

4. **Enable firewall:**
   ```bash
   # Allow only necessary ports
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw enable
   ```

5. **Set up monitoring:**
   - CloudWatch (AWS)
   - Google Cloud Monitoring
   - Custom monitoring solution

### Migrate Existing Data

If you have existing events in local storage:

```bash
# Preview migration
npm run migrate:dry-run

# Migrate all events
npm run migrate

# Migrate specific event
node migrate-to-cloud.js "Event Name"
```

## 🐛 Troubleshooting

### MongoDB Connection Failed

**Error:** `MongoNetworkError: connect ECONNREFUSED`

**Solution:**
1. Check MongoDB is running: `mongod --version`
2. Start MongoDB service
3. Verify connection string in `.env`

### Python Not Found

**Error:** `'python' is not recognized`

**Solution:**
1. Install Python 3 from python.org
2. Add Python to PATH during installation
3. Restart terminal/command prompt
4. Verify: `python --version`

### Cloud Storage Tests Fail

**Error:** `Access Denied` or `Invalid credentials`

**Solution:**
1. Double-check credentials in `.env`
2. Verify no extra spaces in values
3. For AWS: Check IAM permissions
4. For MEGA: Try logging in via web
5. For GCS: Verify JSON key file path

### Port Already in Use

**Error:** `EADDRINUSE: address already in use :::5000`

**Solution:**
1. Change PORT in `.env` to different value (e.g., 5001)
2. Or kill process using port 5000:
   ```bash
   # Windows
   netstat -ano | findstr :5000
   taskkill /PID <PID> /F
   
   # Linux/Mac
   lsof -ti:5000 | xargs kill -9
   ```

### Face Recognition Fails

**Error:** Python process exits with error

**Solution:**
1. Verify Python dependencies installed
2. Check Python version (3.7-3.10 recommended)
3. Install Visual C++ Redistributable (Windows)
4. Check face_processing.log for details

### Email Not Sending

**Error:** `Email transporter verification failed`

**Solution:**
1. Use Gmail App Password, not regular password
2. Enable "Less secure app access" (if using regular password)
3. Check EMAIL_USER and EMAIL_PASS in `.env`
4. Verify network allows SMTP connections

## 📞 Getting Help

If you're still having issues:

1. **Check Documentation:**
   - `README_CLOUD.md` - Main documentation
   - `CLOUD_QUICK_START.md` - Quick start guide
   - `CLOUD_STORAGE_SETUP.md` - Detailed setup
   - `storage/README.md` - API documentation

2. **Review Logs:**
   - Server console output
   - `face_processing.log`
   - Browser console (F12)

3. **Test Components:**
   ```bash
   # Test cloud storage
   npm run test:cloud
   
   # Test MongoDB
   mongosh
   
   # Test Python
   python --version
   python -c "import deepface"
   ```

4. **Common Issues:**
   - Credentials incorrect → Double-check `.env`
   - Network issues → Check firewall/proxy
   - Permission denied → Check file/folder permissions
   - Out of memory → Reduce MAX_UPLOAD_MB

## ✅ Installation Checklist

- [ ] Node.js installed (v14+)
- [ ] MongoDB installed and running
- [ ] Python 3 installed
- [ ] Python dependencies installed
- [ ] npm dependencies installed
- [ ] `.env` file configured
- [ ] Cloud storage configured (or using local)
- [ ] Cloud storage tests pass
- [ ] Server starts successfully
- [ ] Can access web interface
- [ ] Can register and login
- [ ] Can create event
- [ ] Can upload photos
- [ ] Photos appear in cloud storage
- [ ] Face recognition works
- [ ] Can download photos

## 🎊 Success!

Congratulations! You've successfully installed PhotoFlow with cloud storage support. Your application is now ready to handle events of any size with enterprise-grade cloud storage.

**Happy photo matching! 📸☁️**
