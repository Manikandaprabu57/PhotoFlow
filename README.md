# PhotoFlow - Event Photo Management System

Modern event photo management system with AI-powered face recognition and automated guest delivery.

## 🌟 Features

- **Advanced Face Recognition**: Using DeepFace with VGG-Face model
- **Secure Authentication**: OTP-based login system
- **Real-time Processing**: Instant photo matching and delivery
- **Automated Distribution**: ZIP file generation for matched photos
- **QR Code Integration**: Easy guest access system
- **Mobile-First Design**: Responsive, modern interface
- **Robust Security**: Rate limiting, input validation, and secure file handling

## 🏗️ System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Photographer  │    │   Guest (Mobile) │    │  DeepFace AI    │
│    Dashboard    │    │  Upload Interface│    │   Engine        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         └──────────┬───────────────┴────────────┬─────────┘
                    │                            │
              ┌─────▼─────┐              ┌──────▼──────┐
              │  Express  │              │   File      │
              │  Server   │◄────────────►│   System    │
              └───────────┘              └─────────────┘
```

## 📋 Prerequisites

### System Requirements
- **Node.js** >= 14.0.0
- **Python** >= 3.8
- **Storage** Space for photos and processing

### Python Dependencies
```
deepface==0.0.79
pillow==10.0.1
numpy==1.24.3
tensorflow==2.13.0
mtcnn==0.1.1
opencv-python-headless==4.8.1.78
tqdm==4.66.1
```

### Node.js Dependencies
```json
{
  "dependencies": {
    "express": "^4.21.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "multer": "^2.0.0-rc.4",
    "nodemailer": "^7.0.5",
    "qrcode": "^1.5.3",
    "express-rate-limit": "^7.1.0"
  }
}
```

## 🚀 Installation

### 1. Clone and Setup Node.js Backend

```bash
cd "d:\Projects\Photography\register for photographers modified\photoAi"

# Install Node.js dependencies
npm install

# Install additional required packages
npm install multer qrcode archiver
```

### 2. Setup Python Environment

```bash
cd "d:\Projects\Photography\backend project 1"

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install Python dependencies
python install_dependencies.py
```

### 3. Setup MongoDB

**Option A: Local MongoDB**
```bash
# Install MongoDB Community Edition
# Windows: Download from https://www.mongodb.com/try/download/community
# Linux: sudo apt-get install mongodb
# Mac: brew install mongodb/brew/mongodb-community

# Start MongoDB service
mongod --dbpath ./data/db
```

**Option B: MongoDB Atlas (Cloud)**
1. Create account at https://www.mongodb.com/atlas
2. Create cluster and get connection string
3. Update `.env` file with Atlas URI

### 4. Configure Environment

Update `.env` file:
```bash
# Update BASE_URL for production
BASE_URL=https://your-domain.com

# Update email credentials
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Update MongoDB URI if using Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/photographerEventManager
```

### 5. Setup Email (Gmail)

1. Enable 2-Factor Authentication on Gmail
2. Generate App Password:
   - Google Account → Security → 2-Step Verification → App passwords
   - Select "Mail" and generate password
3. Use generated password in `.env` file

## 🎯 Usage Workflow

### For Photographers

1. **Login**: Access dashboard with email + OTP
2. **Create Event**: 
   ```
   Event Name: Wedding_Jan20
   Email: photographer@example.com
   ```
3. **Get QR Code**: Download and share with guests
4. **Upload Photos**: Drag & drop event photos (up to 50 at once)
5. **Process Event**: Click "Process" when guests have uploaded selfies
6. **Automatic Delivery**: System emails guests their personalized albums

### For Guests

1. **Scan QR Code**: Opens mobile-friendly upload page
2. **Enter Email**: Provide email address
3. **Upload Selfies**: Take selfie or upload from gallery (up to 5 photos)
4. **Receive Album**: Get email with download link when processing completes

## 📁 File Structure

```
events/
├── Wedding_Jan20/
│   ├── photos/           # Photographer uploads
│   │   ├── IMG_001.jpg
│   │   └── IMG_002.jpg
│   ├── selfies/          # Guest uploads
│   │   ├── guest1@email.com/
│   │   │   ├── selfie1.jpg
│   │   │   └── selfie2.jpg
│   │   └── guest2@email.com/
│   │       └── selfie1.jpg
│   ├── matched/          # AI processed results
│   │   ├── guest1@email.com/
│   │   │   ├── IMG_001.jpg
│   │   │   └── IMG_005.jpg
│   │   └── guest2@email.com/
│   │       └── IMG_003.jpg
│   ├── exports/          # Zip files for download
│   │   ├── guest1@email.com.zip
│   │   └── guest2@email.com.zip
│   ├── qr-code.png       # Event QR code
│   └── processing_report.json
```

## 🔧 Configuration

### Face Recognition Settings

```bash
# Similarity threshold (0.0-1.0)
# Lower = stricter matching
FACE_SIMILARITY_THRESHOLD=0.5

# Recommended values:
# 0.4 = Very strict (fewer false matches)
# 0.5 = Balanced (default)
# 0.6 = More lenient (more matches)
```

### File Upload Limits

```bash
MAX_PHOTO_SIZE=50MB        # Event photos
MAX_SELFIE_SIZE=10MB       # Guest selfies
MAX_PHOTOS_PER_UPLOAD=50   # Batch upload limit
MAX_SELFIES_PER_GUEST=5    # Per guest limit
```

## 🚀 Running the Application

### Development Mode

```bash
# Terminal 1: Start MongoDB
mongod --dbpath ./data/db

# Terminal 2: Start Node.js server
cd "d:\Projects\Photography\register for photographers modified\photoAi"
npm run dev

# Access application
# Photographer Dashboard: http://localhost:5000
# Guest Upload: http://localhost:5000/guest/{eventName}
```

### Production Deployment

**Railway/Heroku:**
```bash
# Build command
npm install && python -m pip install -r ../backend\ project\ 1/requirements.txt

# Start command
npm start

# Environment variables to set:
# - All variables from .env file
# - BASE_URL=https://your-app.railway.app
```

## 🔍 Troubleshooting

### Common Issues

**1. Face Recognition Installation Fails**
```bash
# Windows: Install Visual Studio Build Tools
# Then install dlib manually:
pip install cmake
pip install dlib
pip install face-recognition
```

**2. MongoDB Connection Error**
```bash
# Check MongoDB is running
mongod --version

# Check connection string in .env
MONGODB_URI=mongodb://localhost:27017/photographerEventManager
```

**3. Email Sending Fails**
```bash
# Verify Gmail App Password (not regular password)
# Check 2FA is enabled
# Test with a simple email first
```

**4. Python Script Not Found**
```bash
# Verify Python path in .env
PYTHON_PATH=python

# Test Python script manually:
cd "d:\Projects\Photography\backend project 1"
python enhanced_face_match.py --help
```

### Performance Optimization

**For Large Events (500+ photos):**
- Use stricter similarity threshold (0.4)
- Process in smaller batches
- Consider cloud GPU for faster processing

**For Better Accuracy:**
- Ask guests for multiple selfies
- Ensure good lighting in selfies
- Use higher resolution photos

## 📊 Monitoring

### Processing Logs
```bash
# View real-time logs
tail -f face_processing.log

# Check processing report
cat events/EventName/processing_report.json
```

### Database Queries
```javascript
// Check event status
db.events.find({}, {eventName: 1, status: 1, guestCount: 1, photoCount: 1})

// Check guest uploads
db.guests.find({eventName: "Wedding_Jan20"})
```

## 🔐 Security Considerations

1. **Email Credentials**: Use app passwords, not main password
2. **File Uploads**: Validate file types and sizes
3. **Database**: Use authentication in production
4. **HTTPS**: Enable SSL/TLS for production
5. **Rate Limiting**: Implement upload rate limits

## 📞 Support

For issues or questions:
1. Check troubleshooting section
2. Review logs for error details
3. Test individual components separately
4. Verify all dependencies are installed

## 🎉 Success Metrics

A successful setup should achieve:
- ✅ Events created and QR codes generated
- ✅ Guests can upload selfies via mobile
- ✅ Face recognition processes without errors
- ✅ Matched photos organized by guest
- ✅ Zip files created and emails sent
- ✅ 80%+ accuracy in face matching

---

**PhotoFlow Pro** - Transforming event photography with AI-powered automation.
