/**
 * PhotoFlow Server with Cloud Storage Integration
 * This version supports AWS S3, MEGA, Google Cloud Storage, and local storage
 */

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const os = require("os");
const multer = require("multer");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
const archiver = require("archiver");
const { spawn, spawnSync } = require("child_process");
require("dotenv").config();
const jwt = require('jsonwebtoken');

// Import cloud storage modules
const { StorageFactory, createCloudMulter } = require('./storage');

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Global cloud storage adapter
let cloudStorage = null;
let useCloudStorage = false;

// Initialize cloud storage
async function initializeCloudStorage() {
  try {
    const provider = process.env.CLOUD_STORAGE_PROVIDER;
    
    if (!provider || provider === 'local') {
      console.log('📁 Using local file storage');
      useCloudStorage = false;
      return;
    }

    console.log(`☁️  Initializing ${provider.toUpperCase()} cloud storage...`);
    cloudStorage = await StorageFactory.createFromEnv();
    useCloudStorage = true;
    console.log(`✅ Cloud storage ready: ${provider.toUpperCase()}`);
  } catch (error) {
    console.error('❌ Cloud storage initialization failed:', error.message);
    console.log('📁 Falling back to local file storage');
    useCloudStorage = false;
  }
}

// Detect Python command
function detectPythonCommand() {
  const venvPython = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    console.log(`🐍 Using virtual environment Python: ${venvPython}`);
    return { cmd: venvPython, args: [] };
  }

  const candidates = [
    { cmd: "py", args: ["-3"] },
    { cmd: "py", args: [] },
    { cmd: "python3", args: [] },
    { cmd: "python", args: [] }
  ];
  
  for (const c of candidates) {
    try {
      const res = spawnSync(c.cmd, [...c.args, "--version"], { encoding: "utf-8" });
      if (res.status === 0 || (res.stdout || res.stderr)?.toLowerCase().includes("python")) {
        console.log(`🐍 Using Python command: ${c.cmd} ${c.args.join(" ")}`);
        return c;
      }
    } catch (_) {}
  }
  
  console.warn("⚠️ No working Python interpreter detected. Defaulting to 'python'.");
  return { cmd: "python", args: [] };
}

const PYTHON = detectPythonCommand();
// Set timeout to 0 for unlimited processing time (no timeout)
const PROCESS_TIMEOUT_MS = Number(process.env.PROCESS_TIMEOUT_MS || 0);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB Error:", err));

// Schemas
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

const eventSchema = new mongoose.Schema({
  eventName: { type: String, required: true, unique: true },
  photographerEmail: { type: String, required: true },
  qrCode: String,
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'processing', 'completed'], default: 'active' },
  guestCount: { type: Number, default: 0 },
  photoCount: { type: Number, default: 0 },
  useCloudStorage: { type: Boolean, default: false },
  cloudProvider: { type: String, default: null }
});
const Event = mongoose.model("Event", eventSchema);

const guestSchema = new mongoose.Schema({
  email: { type: String, required: true },
  eventName: { type: String, required: true },
  selfieCount: { type: Number, default: 0 },
  matchedPhotoCount: { type: Number, default: 0 },
  zipGenerated: { type: Boolean, default: false },
  emailSent: { type: Boolean, default: false },
  processedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });
const Guest = mongoose.model("Guest", guestSchema);

// Nodemailer setup with pooling and timeouts to better handle large attachments
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  pool: true,
  maxConnections: parseInt(process.env.EMAIL_MAX_CONNECTIONS || '5', 10),
  maxMessages: parseInt(process.env.EMAIL_MAX_MESSAGES || '100'),
  // Increase timeouts to allow streaming large attachments
  connectionTimeout: parseInt(process.env.EMAIL_CONNECTION_TIMEOUT_MS || '120000', 10),
  socketTimeout: parseInt(process.env.EMAIL_SOCKET_TIMEOUT_MS || '120000', 10),
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email transporter verification failed:', error.message);
  } else {
    console.log('✅ Email transporter is ready');
  }
});

// Events directory (for local storage fallback and temp files)
const EVENTS_DIR = path.join(__dirname, 'events');
if (!fs.existsSync(EVENTS_DIR)) {
  fs.mkdirSync(EVENTS_DIR);
}

// Configure multer based on storage type
let eventUpload;

function configureMulter() {
  if (useCloudStorage && cloudStorage) {
    console.log('☁️  Configuring multer with cloud storage');
    eventUpload = createCloudMulter(cloudStorage);
  } else {
    console.log('📁 Configuring multer with local storage');
    
    const eventStorage = multer.diskStorage({
      destination: (req, file, cb) => {
        const { eventName } = req.params;
        const { email } = req.body;
        
        let folderPath;
        if (req.route.path.includes('selfie') && email) {
          folderPath = path.join(EVENTS_DIR, eventName, 'selfies', email);
        } else {
          folderPath = path.join(EVENTS_DIR, eventName, 'photos');
        }

        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        
        cb(null, folderPath);
      },
      filename: (req, file, cb) => {
        function sanitizeFilename(filename) {
          let sanitized = filename.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
          sanitized = sanitized.replace(/[\\/:*?"<>|]/g, '_');
          sanitized = sanitized.replace(/_+/g, '_').replace(/^_|_$/g, '');
          if (!sanitized || sanitized === '_') {
            sanitized = 'photo';
          }
          return sanitized;
        }

        const cleanName = sanitizeFilename(file.originalname);
        const filename = Date.now() + '_' + cleanName;
        cb(null, filename);
      }
    });

    const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB ?? '1024', 10);
    const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB > 0 ? MAX_UPLOAD_MB * 1024 * 1024 : undefined;

    eventUpload = multer({ 
      storage: eventStorage,
      limits: MAX_UPLOAD_BYTES ? { fileSize: MAX_UPLOAD_BYTES } : undefined,
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('Only image files are allowed!'));
        }
      }
    });
  }
}

// OTP Storage
const otps = {};

// JWT settings
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_this_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function authenticateToken(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'Authorization token required' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid authorization format' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { email: payload.email };
    next();
  } catch (err) {
    console.error('JWT verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ================= USER AUTH ROUTES =================

app.post("/api/register", async (req, res) => {
  const { name, email, phone } = req.body;
  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) return res.status(400).json({ error: "User already exists" });
  await User.create({ name, email, phone });
  res.json({ message: "Registered successfully" });
});

app.post("/api/send-otp", async (req, res) => {
  const { identifier } = req.body;
  const user = await User.findOne({
    $or: [{ email: identifier }, { phone: identifier }]
  });

  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }
  if (!identifier.includes("@")) {
    return res.status(400).json({ message: "Only email OTP is supported." });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otps[identifier] = otp;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: identifier,
      subject: "Your OTP Code",
      text: `Your OTP is ${otp}`
    });
    res.json({ message: "OTP sent to email." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to send OTP." });
  }
});

app.post("/api/verify-otp", (req, res) => {
  const { identifier, otp } = req.body;
  if (otps[identifier] === otp) {
    delete otps[identifier];
    try {
      const token = jwt.sign({ email: identifier }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      return res.json({ success: true, token, email: identifier });
    } catch (err) {
      console.error('Failed to sign JWT:', err);
      return res.status(500).json({ success: false, message: 'Failed to generate auth token' });
    }
  }
  res.status(400).json({ message: "Invalid OTP." });
});

// ================= EVENT MANAGEMENT ROUTES =================

// Create event - require authentication; photographerEmail is taken from token
app.post("/api/create-event", authenticateToken, async (req, res) => {
  const { eventName } = req.body;
  const photographerEmail = req.user && req.user.email;

  if (!eventName || !photographerEmail) {
    return res.status(400).json({ error: "Event name and authenticated photographer email required" });
  }

  try {
    const existingEvent = await Event.findOne({ eventName });
    if (existingEvent) {
      return res.status(400).json({ error: "Event already exists" });
    }

    // Create event folder structure (always create locally for processing)
    const eventPath = path.join(EVENTS_DIR, eventName);
    const subFolders = ['photos', 'selfies', 'matched', 'exports'];

    fs.mkdirSync(eventPath, { recursive: true });
    subFolders.forEach(folder => {
      fs.mkdirSync(path.join(eventPath, folder), { recursive: true });
    });

    // Generate QR Code
    const qrCodeData = `${process.env.BASE_URL || 'http://localhost:5000'}/guest/${eventName}`;
    const qrCodePath = path.join(eventPath, 'qr-code.png');
    await QRCode.toFile(qrCodePath, qrCodeData);

    // Upload QR code to cloud if enabled
    if (useCloudStorage && cloudStorage) {
      const qrBuffer = fs.readFileSync(qrCodePath);
      await cloudStorage.upload(qrBuffer, `events/${eventName}/qr-code.png`, {
        mimetype: 'image/png'
      });
    }

    // Save event to database (owner = authenticated user)
    const event = await Event.create({
      eventName,
      photographerEmail,
      qrCode: qrCodeData,
      useCloudStorage: useCloudStorage,
      cloudProvider: useCloudStorage ? process.env.CLOUD_STORAGE_PROVIDER : null
    });

    res.json({
      message: "Event created successfully",
      eventName,
      qrCode: qrCodeData,
      qrCodeImage: `/events/${eventName}/qr-code.png`,
      cloudStorage: useCloudStorage,
      cloudProvider: event.cloudProvider
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// Return events for the authenticated user only
app.get("/api/events", authenticateToken, async (req, res) => {
  try {
    const photographerEmail = req.user && req.user.email;
    if (!photographerEmail) return res.json([]);

    const events = await Event.find({ photographerEmail }).sort({ createdAt: -1 });
    res.json(events);
  } catch (error) {
    console.error('Failed to fetch events:', error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// Delete an event - only the owner may delete it
app.delete("/api/events/:eventName", authenticateToken, async (req, res) => {
  const { eventName } = req.params;
  try {
    console.log(`🗑️  Starting deletion of event: ${eventName}`);

    const event = await Event.findOne({ eventName });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.photographerEmail !== req.user.email) return res.status(403).json({ error: 'Not authorized to delete this event' });

    // Delete from database
    console.log(`📊 Deleting from database...`);
    const dbResult = await Promise.all([
      Event.deleteOne({ eventName }),
      Guest.deleteMany({ eventName })
    ]);
    console.log(`✅ Database cleanup: ${dbResult[0]?.deletedCount || 0} event(s), ${dbResult[1]?.deletedCount || 0} guest(s) deleted`);

    // Delete from cloud storage if enabled
    if (useCloudStorage && cloudStorage) {
      console.log(`☁️  Deleting from cloud storage (${process.env.CLOUD_STORAGE_PROVIDER})...`);
      const cloudDeleted = await cloudStorage.deleteDirectory(`events/${eventName}`);
      if (cloudDeleted) {
        console.log(`✅ Cloud storage cleanup completed`);
      } else {
        console.warn(`⚠️  Cloud storage deletion may have failed - check logs above`);
      }
    }

    // Remove local event directory
    const eventPath = path.join(EVENTS_DIR, eventName);
    if (fs.existsSync(eventPath)) {
      console.log(`📁 Deleting local directory: ${eventPath}`);
      await fs.promises.rm(eventPath, { recursive: true, force: true });
      console.log(`✅ Local directory deleted`);
    } else {
      console.log(`ℹ️  No local directory found at: ${eventPath}`);
    }

    console.log(`🎉 Event '${eventName}' deleted successfully!`);
    
    res.json({
      success: true,
      message: `Event '${eventName}' deleted permanently`,
      db: { eventDeleted: dbResult[0]?.deletedCount || 0, guestsDeleted: dbResult[1]?.deletedCount || 0 },
      cloudStorage: useCloudStorage
    });
  } catch (error) {
    console.error("❌ Delete event error:", error);
    res.status(500).json({ error: "Failed to delete event", details: error.message });
  }
});

// Upload event photos
app.post("/api/upload-event-photos/:eventName", (req, res) => {
  console.log(`📤 Upload event photos request: eventName=${req.params.eventName}`);
  
  // Increase the array limit to 10000 photos for large events
  eventUpload.array("photos", 10000)(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        console.error('❌ Upload error: file too large');
        return res.status(400).json({ error: `File too large. Max ${process.env.MAX_UPLOAD_MB || 1024}MB per photo.` });
      }
      console.error('❌ Upload error:', err.message || err);
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }

    const { eventName } = req.params;
    const filesCount = (req.files || []).length;
    console.log(`✅ Files received: ${filesCount}`);
    if (!filesCount) return res.status(400).json({ error: 'No photos uploaded' });

    try {
      // If using cloud storage, also save to local for processing
      if (useCloudStorage && cloudStorage) {
        console.log('💾 Syncing cloud files to local for processing...');
        const localPhotosPath = path.join(EVENTS_DIR, eventName, 'photos');
        if (!fs.existsSync(localPhotosPath)) {
          fs.mkdirSync(localPhotosPath, { recursive: true });
        }
        
        for (const file of req.files) {
          const localPath = path.join(localPhotosPath, file.filename);
          
          try {
            // Use buffer from upload if available (faster than re-downloading)
            if (file.buffer) {
              fs.writeFileSync(localPath, file.buffer);
              console.log(`✅ Synced ${file.filename} to local (${file.buffer.length} bytes)`);
            } else {
              console.log(`⚠️  No buffer for ${file.filename}, downloading from cloud...`);
              // Fallback: download from cloud
              const cloudPath = file.cloudPath || file.path;
              const buffer = await cloudStorage.download(cloudPath);
              fs.writeFileSync(localPath, buffer);
              console.log(`✅ Downloaded and synced ${file.filename} to local (${buffer.length} bytes)`);
            }
          } catch (downloadErr) {
            console.error(`❌ Failed to sync ${file.filename} to local:`, downloadErr.message);
            console.error(downloadErr);
          }
        }
      }

      await Event.findOneAndUpdate(
        { eventName },
        { $inc: { photoCount: filesCount } }
      );
      
      res.json({ 
        message: `${filesCount} photos uploaded successfully`, 
        photoCount: filesCount,
        cloudStorage: useCloudStorage
      });
    } catch (error) {
      console.error('❌ DB update after upload failed:', error);
      res.status(500).json({ error: 'Failed to record upload in database' });
    }
  });
});

// Guest selfie upload
app.post("/api/upload-selfie/:eventName", (req, res) => {
  console.log(`🔍 Upload selfie request: eventName=${req.params.eventName}`);
  
  eventUpload.array("selfies", 5)(req, res, async (err) => {
    if (err) {
      console.error(`❌ Multer error:`, err);
      return res.status(400).json({ error: err.message });
    }

    const { eventName } = req.params;
    const { email } = req.body;
    
    if (!email || !req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Email and selfie required" });
    }

    try {
      const event = await Event.findOne({ eventName });
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // If using cloud storage, sync to local for processing
      if (useCloudStorage && cloudStorage) {
        console.log('💾 Syncing selfies to local for processing...');
        const localSelfiesPath = path.join(EVENTS_DIR, eventName, 'selfies', email);
        if (!fs.existsSync(localSelfiesPath)) {
          fs.mkdirSync(localSelfiesPath, { recursive: true });
        }
        
        for (const file of req.files) {
          const localPath = path.join(localSelfiesPath, file.filename);
          
          try {
            // Use buffer from upload if available (faster than re-downloading)
            if (file.buffer) {
              fs.writeFileSync(localPath, file.buffer);
              console.log(`✅ Synced ${file.filename} to local`);
            } else {
              // Fallback: download from cloud
              const cloudPath = file.cloudPath || file.path;
              const buffer = await cloudStorage.download(cloudPath);
              fs.writeFileSync(localPath, buffer);
              console.log(`✅ Downloaded and synced ${file.filename} to local`);
            }
          } catch (downloadErr) {
            console.error(`⚠️  Failed to sync ${file.filename} to local:`, downloadErr.message);
          }
        }
      }

      const guest = await Guest.findOneAndUpdate(
        { email, eventName },
        {
          $inc: { selfieCount: req.files.length },
          $setOnInsert: { email, eventName }
        },
        { upsert: true, new: true }
      );

      if (guest.selfieCount === req.files.length) {
        await Event.findOneAndUpdate(
          { eventName },
          { $inc: { guestCount: 1 } }
        );
      }

      console.log(`✅ Successfully uploaded ${req.files.length} selfies for ${email}`);

      res.json({
        message: `${req.files.length} selfie(s) uploaded successfully`,
        email,
        selfieCount: guest.selfieCount,
        cloudStorage: useCloudStorage
      });
    } catch (error) {
      console.error(`❌ Database error:`, error);
      res.status(500).json({ error: "Failed to upload selfie" });
    }
  });
});

// Process event (face matching) - continues on next part
app.post("/api/process-event/:eventName", async (req, res) => {
  const { eventName } = req.params;
  
  try {
    await Event.findOneAndUpdate({ eventName }, { status: 'processing' });

    const pythonScript = path.join(__dirname, 'deepface_match_fixed.py');
    const eventPath = path.join(EVENTS_DIR, eventName);

    // 🔧 Sync from cloud storage before processing
    if (useCloudStorage && cloudStorage) {
      console.log('☁️  Syncing event files from cloud storage to local...');
      try {
        await syncEventFromCloud(eventName);
        console.log('✅ Event files synced from cloud to local');
      } catch (syncErr) {
        console.error('❌ Failed to sync from cloud:', syncErr);
        await Event.findOneAndUpdate({ eventName }, { status: 'active' });
        return res.status(500).json({
          error: "Failed to sync files from cloud storage",
          details: syncErr.message
        });
      }
    }

    // Check for selfies and photos
    const selfiesPath = path.join(eventPath, 'selfies');
    let guestCount = 0;
    if (fs.existsSync(selfiesPath)) {
      const guestFolders = fs.readdirSync(selfiesPath).filter(item =>
        fs.statSync(path.join(selfiesPath, item)).isDirectory()
      );
      guestCount = guestFolders.length;
    }

    if (guestCount === 0) {
      await Event.findOneAndUpdate({ eventName }, { status: 'active' });
      return res.status(400).json({
        error: "No guest selfies found",
        message: "Please ensure guests have uploaded selfies before processing"
      });
    }

    const photosPath = path.join(eventPath, 'photos');
    let photoCount = 0;
    if (fs.existsSync(photosPath)) {
      photoCount = fs.readdirSync(photosPath).filter(file => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)).length;
    }
    
    if (photoCount === 0) {
      await Event.findOneAndUpdate({ eventName }, { status: 'active' });
      return res.status(400).json({
        error: "No photos found",
        message: "Please upload event photos before processing"
      });
    }

    console.log(`🚀 Starting face matching for ${eventName}...`);
    const pythonProcess = spawn(PYTHON.cmd, [...PYTHON.args, pythonScript, eventPath], {
      cwd: __dirname,
      env: { ...process.env }
    });

    let outputData = '';
    let errorData = '';

    // Only set timeout if PROCESS_TIMEOUT_MS > 0, otherwise unlimited
    let killTimer = null;
    if (PROCESS_TIMEOUT_MS > 0) {
      killTimer = setTimeout(async () => {
        console.error(`⏱️ Python process timeout after ${PROCESS_TIMEOUT_MS}ms`);
        try { pythonProcess.kill('SIGKILL'); } catch (_) {}
      }, PROCESS_TIMEOUT_MS);
    } else {
      console.log(`⏱️  No timeout set - process will run until completion`);
    }

    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
      console.log(`Python output: ${data}`);
    });

    pythonProcess.on('close', async (code) => {
      if (killTimer) clearTimeout(killTimer);
      console.log(`Python process exited with code: ${code}`);

      if (code === 0) {
        await Event.findOneAndUpdate({ eventName }, { status: 'completed' });
        
        // Update matched photo counts for each guest
        console.log('📊 Updating matched photo counts for guests...');
        await updateGuestMatchedCounts(eventName);
        
        await Guest.updateMany({ eventName, selfieCount: { $gt: 0 } }, { $set: { processedAt: new Date() } });
        
        // Sync matched photos to cloud if enabled
        if (useCloudStorage && cloudStorage) {
          console.log('☁️  Syncing matched photos to cloud...');
          await syncMatchedPhotosToCloud(eventName);
        }
        
        await generateZipFilesAndSendEmails(eventName);
        
        res.json({ 
          message: "Event processing completed successfully", 
          output: outputData,
          guestCount: guestCount,
          cloudStorage: useCloudStorage
        });
      } else {
        await Event.findOneAndUpdate({ eventName }, { status: 'active' });
        res.status(500).json({
          error: "Face recognition processing failed",
          details: errorData,
          exitCode: code
        });
      }
    });

    pythonProcess.on('error', async (error) => {
      console.error(`Failed to start Python process: ${error}`);
      await Event.findOneAndUpdate({ eventName }, { status: 'active' });
      res.status(500).json({
        error: "Failed to start face recognition process",
        details: error.message
      });
    });

  } catch (error) {
    console.error(`Process event error: ${error}`);
    await Event.findOneAndUpdate({ eventName }, { status: 'active' });
    res.status(500).json({ 
      error: "Failed to process event", 
      details: error.message 
    });
  }
});

// Sync event files FROM cloud storage TO local before processing
async function syncEventFromCloud(eventName) {
  if (!useCloudStorage || !cloudStorage) return;
  
  console.log(`📥 Syncing files from cloud for event: ${eventName}`);
  
  try {
    const eventPath = path.join(EVENTS_DIR, eventName);
    
    // Sync photos from cloud
    const photosCloudPath = `events/${eventName}/photos`;
    const photosLocalPath = path.join(eventPath, 'photos');
    
    console.log(`📥 Downloading photos from: ${photosCloudPath}`);
    const photoFiles = await cloudStorage.list(photosCloudPath);
    
    if (photoFiles && photoFiles.length > 0) {
      if (!fs.existsSync(photosLocalPath)) {
        fs.mkdirSync(photosLocalPath, { recursive: true });
      }
      
      console.log(`📥 Found ${photoFiles.length} photo(s) in cloud storage`);
      
      for (const file of photoFiles) {
        // Skip if it's a directory marker or empty
        if (!file.name || file.size === 0) continue;
        
        const fileName = file.name;
        const localPath = path.join(photosLocalPath, fileName);
        
        // Skip if already exists locally
        if (fs.existsSync(localPath)) {
          console.log(`⏭️  Skipping ${fileName} (already exists locally)`);
          continue;
        }
        
        try {
          console.log(`📥 Downloading: ${fileName}`);
          const buffer = await cloudStorage.download(file.path);
          fs.writeFileSync(localPath, buffer);
          console.log(`✅ Downloaded: ${fileName} (${(buffer.length / 1024 / 1024).toFixed(2)}MB)`);
        } catch (err) {
          console.error(`❌ Failed to download ${fileName}:`, err.message);
        }
      }
    }
    
    // Sync selfies from cloud
    const selfiesCloudPath = `events/${eventName}/selfies`;
    const selfiesLocalPath = path.join(eventPath, 'selfies');
    
    console.log(`📥 Downloading selfies from: ${selfiesCloudPath}`);
    
    // List all guest folders
    const allSelfieFiles = await cloudStorage.list(selfiesCloudPath);
    
    if (allSelfieFiles && allSelfieFiles.length > 0) {
      console.log(`📥 Found ${allSelfieFiles.length} selfie(s) in cloud storage`);
      
      // Group files by guest folder
      const guestFolders = {};
      for (const file of allSelfieFiles) {
        // Skip directory markers or empty files
        if (!file.name || file.size === 0) continue;
        
        const pathParts = file.path.split('/');
        const guestEmail = pathParts[pathParts.length - 2]; // e.g., email@domain.com
        if (!guestFolders[guestEmail]) guestFolders[guestEmail] = [];
        guestFolders[guestEmail].push(file);
      }
      
      // Download selfies for each guest
      for (const [guestEmail, files] of Object.entries(guestFolders)) {
        const guestLocalPath = path.join(selfiesLocalPath, guestEmail);
        if (!fs.existsSync(guestLocalPath)) {
          fs.mkdirSync(guestLocalPath, { recursive: true });
        }
        
        for (const file of files) {
          const fileName = file.name;
          const localPath = path.join(guestLocalPath, fileName);
          
          // Skip if already exists
          if (fs.existsSync(localPath)) {
            console.log(`⏭️  Skipping ${guestEmail}/${fileName} (already exists)`);
            continue;
          }
          
          try {
            console.log(`📥 Downloading: ${guestEmail}/${fileName}`);
            const buffer = await cloudStorage.download(file.path);
            fs.writeFileSync(localPath, buffer);
            console.log(`✅ Downloaded: ${guestEmail}/${fileName}`);
          } catch (err) {
            console.error(`❌ Failed to download ${guestEmail}/${fileName}:`, err.message);
          }
        }
      }
    }
    
    console.log(`✅ Sync complete for event: ${eventName}`);
  } catch (error) {
    console.error(`❌ Error syncing event from cloud:`, error);
    throw error;
  }
}

// Update matched photo counts for all guests in an event
async function updateGuestMatchedCounts(eventName) {
  try {
    const matchedPath = path.join(EVENTS_DIR, eventName, 'matched');
    
    // If matched directory doesn't exist, set all counts to 0
    if (!fs.existsSync(matchedPath)) {
      console.log('⚠️  No matched directory found, setting all counts to 0');
      await Guest.updateMany({ eventName }, { matchedPhotoCount: 0 });
      return;
    }

    // Get all guest folders in matched directory
    const guestFolders = fs.readdirSync(matchedPath).filter(item =>
      fs.statSync(path.join(matchedPath, item)).isDirectory()
    );

    console.log(`📊 Found ${guestFolders.length} guest folders with matches`);

    // Update count for each guest
    for (const guestEmail of guestFolders) {
      const guestPath = path.join(matchedPath, guestEmail);
      const photos = fs.readdirSync(guestPath).filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
      );

      const matchCount = photos.length;
      
      await Guest.findOneAndUpdate(
        { eventName, email: guestEmail },
        { matchedPhotoCount: matchCount },
        { upsert: false }
      );

      console.log(`  ✅ ${guestEmail}: ${matchCount} matched photos`);
    }

    // Set count to 0 for guests with no matches
    const allGuests = await Guest.find({ eventName });
    for (const guest of allGuests) {
      if (!guestFolders.includes(guest.email)) {
        await Guest.findOneAndUpdate(
          { eventName, email: guest.email },
          { matchedPhotoCount: 0 }
        );
        console.log(`  ℹ️  ${guest.email}: 0 matched photos`);
      }
    }

    console.log('✅ Matched photo counts updated successfully');
  } catch (error) {
    console.error('❌ Error updating matched photo counts:', error);
  }
}

// Sync matched photos to cloud storage
async function syncMatchedPhotosToCloud(eventName) {
  if (!useCloudStorage || !cloudStorage) return;
  
  try {
    const matchedPath = path.join(EVENTS_DIR, eventName, 'matched');
    if (!fs.existsSync(matchedPath)) return;

    const guestFolders = fs.readdirSync(matchedPath).filter(item =>
      fs.statSync(path.join(matchedPath, item)).isDirectory()
    );

    for (const guestEmail of guestFolders) {
      const guestPath = path.join(matchedPath, guestEmail);
      const photos = fs.readdirSync(guestPath).filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
      );

      for (const photo of photos) {
        const localPath = path.join(guestPath, photo);
        const cloudPath = `events/${eventName}/matched/${guestEmail}/${photo}`;
        
        try {
          const buffer = fs.readFileSync(localPath);
          await cloudStorage.upload(buffer, cloudPath, {
            mimetype: 'image/jpeg'
          });
          console.log(`☁️  Uploaded matched photo: ${cloudPath}`);
        } catch (uploadErr) {
          console.error(`⚠️  Failed to upload ${photo}:`, uploadErr.message);
        }
      }
    }
    
    console.log(`✅ Matched photos synced to cloud for ${eventName}`);
  } catch (error) {
    console.error('Error syncing matched photos to cloud:', error);
  }
}

// Generate zip files and send emails
async function generateZipFilesAndSendEmails(eventName) {
  try {
    const guests = await Guest.find({ eventName });
    if (!guests || guests.length === 0) {
      console.log('⚠️ No guests found for event:', eventName);
      return;
    }

    const eventPath = path.join(EVENTS_DIR, eventName);
    const exportsPath = path.join(eventPath, 'exports');
    if (!fs.existsSync(exportsPath)) {
      fs.mkdirSync(exportsPath, { recursive: true });
    }

    console.log(`🔄 Processing ${guests.length} guests for event: ${eventName}`);
    
    for (const guest of guests) {
      const guestMatchedPath = path.join(eventPath, 'matched', guest.email);
      const zipPath = path.join(eventPath, 'exports', `${guest.email}.zip`);
      
      if (fs.existsSync(guestMatchedPath)) {
        const matchedPhotos = fs.readdirSync(guestMatchedPath);
        if (matchedPhotos.length === 0) continue;

        try {
          if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
          }

          await createZipFile(guestMatchedPath, zipPath);
          
          // Upload zip to cloud if enabled
          if (useCloudStorage && cloudStorage) {
            const zipBuffer = fs.readFileSync(zipPath);
            await cloudStorage.upload(zipBuffer, `events/${eventName}/exports/${guest.email}.zip`, {
              mimetype: 'application/zip'
            });
            console.log(`☁️  Uploaded zip to cloud for ${guest.email}`);
          }

          if (process.env.EMAIL_ENABLED && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            await sendGuestEmail(guest.email, eventName, zipPath);
          }

          await Guest.findOneAndUpdate(
            { email: guest.email, eventName },
            { zipGenerated: true, emailSent: process.env.EMAIL_ENABLED && !!process.env.EMAIL_USER }
          );
        } catch (error) {
          console.error(`❌ Error processing ${guest.email}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error in zip generation and email sending:', error);
  }
}

// Create zip file (same as original)
function createZipFile(sourcePath, outputPath) {
  return new Promise((resolve, reject) => {
    let tempDir = null;
    let archive = null;
    
    try {
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source path does not exist: ${sourcePath}`);
      }

      const files = fs.readdirSync(sourcePath);
      if (files.length === 0) {
        throw new Error(`No files found in source path: ${sourcePath}`);
      }

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photoai-zip-'));
      const photosDir = path.join(tempDir, 'matched_photos');
      fs.mkdirSync(photosDir);

      let photoCount = 0;
      for (const file of files) {
        const sourcefile = path.join(sourcePath, file);
        const destFile = path.join(photosDir, file);
        fs.copyFileSync(sourcefile, destFile);
        photoCount++;
      }

      const metadata = {
        totalPhotos: photoCount,
        generatedAt: new Date().toISOString(),
        event: path.basename(path.dirname(path.dirname(sourcePath))),
        guest: path.basename(sourcePath)
      };
      
      fs.writeFileSync(
        path.join(tempDir, 'metadata.json'), 
        JSON.stringify(metadata, null, 2)
      );

      const output = fs.createWriteStream(outputPath);
      archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        if (tempDir) {
          try {
            fs.rmSync(tempDir, { recursive: true });
          } catch (err) {
            console.warn('⚠️ Failed to clean up temp directory:', err);
          }
        }
        resolve();
      });

      archive.on('error', (err) => {
        throw err;
      });

      const readmeContent = `Thank you for using our photo matching service!

Event: ${metadata.event}
Total Photos: ${metadata.totalPhotos}
Generated: ${new Date().toLocaleString()}

This zip file contains:
- matched_photos/: All photos that matched your selfie
- metadata.json: Technical details about the matching process
`;
      archive.append(readmeContent, { name: 'README.txt' });
      archive.pipe(output);
      archive.directory(tempDir, false);
      archive.finalize();
    } catch (error) {
      if (tempDir) {
        try {
          fs.rmSync(tempDir, { recursive: true });
        } catch (cleanupErr) {
          console.warn('⚠️ Failed to clean up temp directory:', cleanupErr);
        }
      }
      if (archive && typeof archive.abort === 'function') {
        try {
          archive.abort();
        } catch (archiveErr) {
          console.warn('⚠️ Failed to abort archive:', archiveErr);
        }
      }
      reject(error);
    }
  });
}

// Send email to guest with ZIP attachment
async function sendGuestEmail(guestEmail, eventName, zipPath) {
  // Verify the ZIP file exists before sending
  if (!fs.existsSync(zipPath)) {
    console.error(`\u274c ZIP file not found for email: ${zipPath}`);
    throw new Error(`ZIP file not found: ${zipPath}`);
  }

  const stats = fs.statSync(zipPath);
  const fileSizeMB = stats.size / (1024 * 1024);

  // If cloud storage is enabled and the file exists in cloud, prefer sending a signed link instead of the attachment
  try {
    if (useCloudStorage && cloudStorage) {
      const cloudPath = `events/${eventName}/exports/${guestEmail}.zip`;
      try {
        const existsInCloud = await cloudStorage.exists(cloudPath);
        if (existsInCloud) {
          // Generate signed URL (24 hours default)
          const url = await cloudStorage.getUrl(cloudPath, 24 * 3600);
          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: guestEmail,
            subject: `Your Photos from ${eventName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4f46e5;">Your photos are ready! \ud83d\udcf8</h2>
                <p>Thank you for attending <strong>${eventName}</strong>! Your photos have been processed.</p>
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0; font-weight: 600;">\ud83d\udce6 Download link (valid 24 hours):</p>
                  <p><a href="${url}">${path.basename(zipPath)}</a> (${fileSizeMB.toFixed(2)} MB)</p>
                </div>
                <p>If you have any trouble downloading the file, contact the event organizer.</p>
                <div style="margin-top: 30px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                  <p>This is an automated message. Please do not reply to this email.</p>
                </div>
              </div>
            `
          };

          await transporter.sendMail(mailOptions);
          console.log(`\u2705 Sent download link to ${guestEmail} (cloud) for ${cloudPath}`);
          return;
        }
      } catch (cloudErr) {
        console.warn('\u26a0\ufe0f Failed to check/generate cloud URL, will attempt attachment fallback:', cloudErr.message || cloudErr);
        // fall through to attachment path
      }
    }

    // If cloud not available or file not present in cloud, try to attach the zip when reasonably small
    if (fileSizeMB <= 20) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: guestEmail,
        subject: `Your Photos from ${eventName}`,
        html: `
          <h2>Your personalized photo album is ready!</h2>
          <p>Thank you for attending ${eventName}. Your matched photos have been processed and are attached to this email as a ZIP file.</p>
          <p><strong>File Size:</strong> ${fileSizeMB.toFixed(2)} MB</p>
          <p>If you have trouble downloading or the file is too large, please contact the event organizer.</p>
          <p>Best regards,<br>PhotoFlow Team</p>
        `,
        attachments: [
          {
            filename: `${eventName}_${guestEmail.replace('@', '_')}.zip`,
            path: zipPath
          }
        ]
      };

      await transporter.sendMail(mailOptions);
      console.log(`\u2705 Email sent to ${guestEmail} with ZIP attachment (${fileSizeMB.toFixed(2)} MB)`);
      return;
    }

    // For large files without cloud support, send a lightweight email advising to download from dashboard or contact organizer
    const fallbackMail = {
      from: process.env.EMAIL_USER,
      to: guestEmail,
      subject: `Your Photos from ${eventName} - Download Instructions`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">Your photos are ready! \ud83d\udcf8</h2>
          <p>Thank you for attending <strong>${eventName}</strong>! Your photo ZIP (${fileSizeMB.toFixed(2)} MB) is too large to attach via email.</p>
          <p>Please use the event dashboard to download your album or contact the event organizer for an alternative delivery.</p>
          <div style="margin-top: 30px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(fallbackMail);
    console.log(`\u2705 Fallback email sent to ${guestEmail} (no attachment)`);
    return;

  } catch (error) {
    console.error(`\u274c Failed to send email to ${guestEmail}:`, error);

    // If socket/write cancellation errors occur (ESOCKET / ECANCELED), attempt fallback to cloud link when possible
    const isSocketCancelled = (error && (error.code === 'ESOCKET' || (error.errno && String(error.errno).includes('4081')) || String(error.message || '').includes('ECANCELED')));
    if (isSocketCancelled && useCloudStorage && cloudStorage) {
      try {
        const cloudPath = `events/${eventName}/exports/${guestEmail}.zip`;
        const existsInCloud = await cloudStorage.exists(cloudPath);
        if (existsInCloud) {
          const url = await cloudStorage.getUrl(cloudPath, 24 * 3600);
          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: guestEmail,
            subject: `Your Photos from ${eventName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4f46e5;">Your photos are ready! \ud83d\udcf8</h2>
                <p>We were unable to attach the ZIP to this email due to a connection error. You can download your photos using the link below (valid 24 hours):</p>
                <p><a href="${url}">${path.basename(zipPath)}</a></p>
                <div style="margin-top: 30px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                  <p>This is an automated message. Please do not reply to this email.</p>
                </div>
              </div>
            `
          };

          await transporter.sendMail(mailOptions);
          console.log(`\u2705 Sent cloud download link to ${guestEmail} after socket error`);
          return;
        }
      } catch (cloudErr) {
        console.error('\u274c Failed to generate cloud fallback link after socket error:', cloudErr);
      }
    }

    // Re-throw so caller can handle/log as needed
    throw error;
  }
}

// Download guest photos
app.get("/download/:eventName/:email", async (req, res) => {
  const { eventName, email } = req.params;
  
  try {
    // Try cloud storage first
    if (useCloudStorage && cloudStorage) {
      const cloudPath = `events/${eventName}/exports/${email}.zip`;
      const exists = await cloudStorage.exists(cloudPath);
      
      if (exists) {
        console.log(`☁️  Downloading from cloud: ${cloudPath}`);
        const buffer = await cloudStorage.download(cloudPath);
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${eventName}_${email.replace('@', '_')}.zip"`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
        return;
      }
    }
    
    // Fallback to local storage
    const zipPath = path.join(EVENTS_DIR, eventName, 'exports', `${email}.zip`);
    
    if (fs.existsSync(zipPath)) {
      const stats = fs.statSync(zipPath);
      console.log(`📁 Downloading from local: ${zipPath}`);
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${eventName}_${email.replace('@', '_')}.zip"`);
      res.setHeader('Content-Length', stats.size);
      
      const fileStream = fs.createReadStream(zipPath);
      fileStream.pipe(res);
    } else {
      res.status(404).json({ 
        error: "Photos not found",
        message: "The requested photo album could not be found."
      });
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: "Failed to download photos" });
  }
});

// Guest upload page
app.get("/guest/:eventName", async (req, res) => {
  const { eventName } = req.params;
  try {
    const event = await Event.findOne({ eventName });
    if (!event) {
      return res.status(404).send("Event not found");
    }
    res.sendFile(path.join(__dirname, "guest-upload.html"));
  } catch (error) {
    res.status(500).send("Server error");
  }
});

// ================= PHOTO GALLERY API ROUTES =================

// Get event statistics
app.get("/api/event-stats/:eventName", async (req, res) => {
  const { eventName } = req.params;

  try {
    let totalPhotos = 0;
    let totalGuests = 0;
    let totalMatches = 0;

    // Always use local filesystem (faster) and database (already synced)
    // No need to query cloud storage repeatedly - use local synced copies
    const eventPath = path.join(EVENTS_DIR, eventName);
    const photosPath = path.join(eventPath, 'photos');
    const matchedPath = path.join(eventPath, 'matched');

    if (fs.existsSync(photosPath)) {
      const photoFiles = fs.readdirSync(photosPath).filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
      );
      totalPhotos = photoFiles.length;
    }

    // Get guests from database (selfie uploaders)
    const guests = await Guest.find({ eventName, selfieCount: { $gt: 0 } });
    totalGuests = guests.length;

    if (fs.existsSync(matchedPath)) {
      const guestFolders = fs.readdirSync(matchedPath).filter(item =>
        fs.statSync(path.join(matchedPath, item)).isDirectory()
      );

      for (const guestFolder of guestFolders) {
        const guestPath = path.join(matchedPath, guestFolder);
        const matchedFiles = fs.readdirSync(guestPath).filter(file =>
          /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
        );
        totalMatches += matchedFiles.length;
      }
    }

    res.json({
      totalPhotos,
      totalGuests,
      totalMatches,
      cloudStorage: useCloudStorage
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get event statistics" });
  }
});

// Get list of guest selfies (count only, no images)
app.get("/api/guest-selfies/:eventName", async (req, res) => {
  const { eventName } = req.params;

  try {
    // Get from database - just counts
    const guests = await Guest.find({ eventName, selfieCount: { $gt: 0 } })
      .select('email selfieCount displayName')
      .lean();

    res.json(guests.map(g => ({
      email: g.email,
      selfieCount: g.selfieCount,
      displayName: g.displayName || g.email
    })));

  } catch (error) {
    console.error(`Error getting guest selfies for ${eventName}:`, error);
    res.status(500).json({ error: "Failed to get guest selfies" });
  }
});

// Get list of guests with matched photos (count only, no images)
app.get("/api/guests/:eventName", async (req, res) => {
  const { eventName } = req.params;

  try {
    let guestData = [];

    if (useCloudStorage && cloudStorage) {
      // Use local matched folder (faster and more reliable)
      const matchedPath = path.join(EVENTS_DIR, eventName, 'matched');

      if (!fs.existsSync(matchedPath)) {
        return res.json([]);
      }

      const guestFolders = fs.readdirSync(matchedPath).filter(item => {
        const itemPath = path.join(matchedPath, item);
        return fs.statSync(itemPath).isDirectory();
      });

      guestData = guestFolders.map(guestEmail => {
        const guestPath = path.join(matchedPath, guestEmail);
        const photoFiles = fs.readdirSync(guestPath).filter(file =>
          /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
        );

        return {
          email: guestEmail,
          matchedCount: photoFiles.length,
          displayName: guestEmail
        };
      });
    } else {
      const matchedPath = path.join(EVENTS_DIR, eventName, 'matched');

      if (!fs.existsSync(matchedPath)) {
        return res.json([]);
      }

      const guestFolders = fs.readdirSync(matchedPath).filter(item => {
        const itemPath = path.join(matchedPath, item);
        return fs.statSync(itemPath).isDirectory();
      });

      guestData = guestFolders.map(guestEmail => {
        const guestPath = path.join(matchedPath, guestEmail);
        const photoFiles = fs.readdirSync(guestPath).filter(file =>
          /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
        );

        return {
          email: guestEmail,
          matchedCount: photoFiles.length,
          displayName: guestEmail
        };
      });
    }

    res.json(guestData);

  } catch (error) {
    console.error(`Error getting guests for ${eventName}:`, error);
    res.status(500).json({ error: "Failed to get guest list" });
  }
});

// Get all event photos
app.get("/api/event-photos/:eventName", async (req, res) => {
  const { eventName } = req.params;

  try {
    let photos = [];

    if (useCloudStorage && cloudStorage) {
      // Serve from local synced files instead of generating MEGA links (faster)
      const photosPath = path.join(EVENTS_DIR, eventName, 'photos');
      
      if (!fs.existsSync(photosPath)) {
        return res.json([]);
      }

      const photoFiles = fs.readdirSync(photosPath).filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
      );

      photos = photoFiles.map(filename => ({
        name: filename,
        path: `/events/${eventName}/photos/${filename}`
      }));
    } else {
      const photosPath = path.join(EVENTS_DIR, eventName, 'photos');

      if (!fs.existsSync(photosPath)) {
        return res.json([]);
      }

      const photoFiles = fs.readdirSync(photosPath).filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
      );

      photos = photoFiles.map(filename => ({
        name: filename,
        path: `/events/${eventName}/photos/${filename}`
      }));
    }

    res.json(photos);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get event photos" });
  }
});

// Get guest photos
app.get("/api/guest-photos/:eventName/:guestEmail", async (req, res) => {
  const { eventName, guestEmail } = req.params;

  try {
    let photos = [];

    if (useCloudStorage && cloudStorage) {
      // Serve from local synced files instead of generating MEGA links (faster)
      const guestPath = path.join(EVENTS_DIR, eventName, 'matched', guestEmail);

      if (!fs.existsSync(guestPath)) {
        return res.json([]);
      }

      const photoFiles = fs.readdirSync(guestPath).filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
      );

      photos = photoFiles.map(filename => ({
        name: filename,
        path: `/events/${eventName}/matched/${guestEmail}/${filename}`,
        url: `${req.protocol}://${req.get('host')}/events/${eventName}/matched/${guestEmail}/${filename}`
      }));
    } else {
      const guestPath = path.join(EVENTS_DIR, eventName, 'matched', guestEmail);

      if (!fs.existsSync(guestPath)) {
        return res.json([]);
      }

      const photoFiles = fs.readdirSync(guestPath).filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
      );

      photos = photoFiles.map(filename => ({
        name: filename,
        path: `/events/${eventName}/matched/${guestEmail}/${filename}`,
        url: `${req.protocol}://${req.get('host')}/events/${eventName}/matched/${guestEmail}/${filename}`
      }));
    }

    console.log(`📷 Found ${photos.length} photos for guest ${guestEmail}`);
    res.json(photos);

  } catch (error) {
    console.error(`Error getting photos for guest ${guestEmail}:`, error);
    res.status(500).json({ error: "Failed to get guest photos" });
  }
});

// Serve event files statically (for local storage)
app.use('/events', express.static(EVENTS_DIR));

// ================= ANALYTICS API ROUTES =================

// 📊 Get comprehensive analytics data (scoped to authenticated photographer)
app.get("/api/analytics/overview", authenticateToken, async (req, res) => {
  try {
    const photographerEmail = req.user && req.user.email;
    if (!photographerEmail) return res.status(401).json({ error: 'Unauthorized' });

    const events = await Event.find({ photographerEmail });
    // Guests associated with the authenticated photographer's events
    const eventNames = events.map(e => e.eventName);
    const guests = eventNames.length ? await Guest.find({ eventName: { $in: eventNames } }) : [];
    
    // Event Performance Metrics
    const totalEvents = events.length;
    const completedEvents = events.filter(e => e.status === 'completed').length;
    const activeEvents = events.filter(e => e.status === 'active').length;
    const processingEvents = events.filter(e => e.status === 'processing').length;
    const successRate = totalEvents > 0 ? ((completedEvents / totalEvents) * 100).toFixed(1) : 0;
    
    // Guest Engagement Metrics
    const totalGuests = guests.length;
    const totalSelfies = guests.reduce((sum, g) => sum + g.selfieCount, 0);
    const avgSelfiesPerGuest = totalGuests > 0 ? (totalSelfies / totalGuests).toFixed(1) : 0;
    const guestsWithMatches = guests.filter(g => g.matchedPhotoCount > 0).length;
    const participationRate = totalGuests > 0 ? ((guestsWithMatches / totalGuests) * 100).toFixed(1) : 0;
    
    // Email Delivery Stats
    const emailsSent = guests.filter(g => g.emailSent).length;
    const emailDeliveryRate = totalGuests > 0 ? ((emailsSent / totalGuests) * 100).toFixed(1) : 0;
    
    // Photo Statistics
    const totalPhotos = events.reduce((sum, e) => sum + e.photoCount, 0);
    const totalMatches = guests.reduce((sum, g) => sum + g.matchedPhotoCount, 0);
    const avgMatchesPerGuest = totalGuests > 0 ? (totalMatches / totalGuests).toFixed(1) : 0;
    
    // Storage calculation (simplified - based on event count)
    const storageUsed = {
      cloudEvents: events.filter(e => e.useCloudStorage).length,
      localEvents: events.filter(e => !e.useCloudStorage).length
    };
    
    res.json({
      eventPerformance: {
        totalEvents,
        completedEvents,
        activeEvents,
        processingEvents,
        successRate: parseFloat(successRate)
      },
      guestEngagement: {
        totalGuests,
        totalSelfies,
        avgSelfiesPerGuest: parseFloat(avgSelfiesPerGuest),
        participationRate: parseFloat(participationRate),
        guestsWithMatches
      },
      emailStats: {
        emailsSent,
        emailDeliveryRate: parseFloat(emailDeliveryRate)
      },
      photoStats: {
        totalPhotos,
        totalMatches,
        avgMatchesPerGuest: parseFloat(avgMatchesPerGuest)
      },
      storage: storageUsed
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// 📈 Get time-series data for charts (scoped to authenticated photographer)
app.get("/api/analytics/timeseries", authenticateToken, async (req, res) => {
  try {
    const { range = '30' } = req.query; // days
    const daysBack = parseInt(range);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const photographerEmail = req.user && req.user.email;
    if (!photographerEmail) return res.status(401).json({ error: 'Unauthorized' });

    const events = await Event.find({ photographerEmail, createdAt: { $gte: startDate } }).sort({ createdAt: 1 });
    const eventNames = events.map(e => e.eventName);
    const guests = eventNames.length ? await Guest.find({ eventName: { $in: eventNames }, createdAt: { $gte: startDate } }).sort({ createdAt: 1 }) : [];
    
    // Group events by date
    const eventsByDate = {};
    events.forEach(event => {
      const date = event.createdAt.toISOString().split('T')[0];
      eventsByDate[date] = (eventsByDate[date] || 0) + 1;
    });
    
    // Group guest uploads by date and hour
    const guestsByDate = {};
    const guestsByHour = Array(24).fill(0);
    
    guests.forEach(guest => {
      const date = guest.createdAt.toISOString().split('T')[0];
      guestsByDate[date] = (guestsByDate[date] || 0) + 1;
      
      const hour = guest.createdAt.getHours();
      guestsByHour[hour] += 1;
    });
    
    // Photo uploads by event
    const photosByEvent = events.map(e => ({
      eventName: e.eventName,
      photoCount: e.photoCount,
      guestCount: e.guestCount,
      createdAt: e.createdAt
    }));
    
    res.json({
      eventsByDate,
      guestsByDate,
      guestsByHour,
      photosByEvent,
      range: daysBack
    });
  } catch (error) {
    console.error('Timeseries error:', error);
    res.status(500).json({ error: 'Failed to fetch timeseries data' });
  }
});

// 🏆 Get top performing events (scoped to authenticated photographer)
app.get("/api/analytics/top-events", authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const photographerEmail = req.user && req.user.email;
    if (!photographerEmail) return res.status(401).json({ error: 'Unauthorized' });

    const events = await Event.find({ status: 'completed', photographerEmail })
      .sort({ guestCount: -1 })
      .limit(parseInt(limit));
    
    const eventStats = await Promise.all(events.map(async (event) => {
      const guests = await Guest.find({ eventName: event.eventName });
      const totalMatches = guests.reduce((sum, g) => sum + g.matchedPhotoCount, 0);
      
      return {
        eventName: event.eventName,
        guestCount: event.guestCount,
        photoCount: event.photoCount,
        totalMatches,
        avgMatchesPerGuest: event.guestCount > 0 ? (totalMatches / event.guestCount).toFixed(1) : 0,
        createdAt: event.createdAt,
        status: event.status
      };
    }));
    
    res.json(eventStats);
  } catch (error) {
    console.error('Top events error:', error);
    res.status(500).json({ error: 'Failed to fetch top events' });
  }
});

// 📸 Get popular photos (most matched) - only for photographer's own event
app.get("/api/analytics/popular-photos/:eventName", authenticateToken, async (req, res) => {
  try {
    const { eventName } = req.params;
    const photographerEmail = req.user && req.user.email;
    if (!photographerEmail) return res.status(401).json({ error: 'Unauthorized' });

    const event = await Event.findOne({ eventName });
    if (!event) return res.status(404).json([]);
    if (event.photographerEmail !== photographerEmail) return res.status(403).json({ error: 'Not authorized to view analytics for this event' });
    
    // For cloud storage, we'd need to query the storage adapter
    // For now, returning empty array for cloud storage events
    if (useCloudStorage) {
      return res.json([]);
    }
    
    const matchedPath = path.join(EVENTS_DIR, eventName, 'matched');
    
    if (!fs.existsSync(matchedPath)) {
      return res.json([]);
    }
    
    // Count occurrences of each photo across all guest folders
    const photoOccurrences = {};
    
    const guestFolders = fs.readdirSync(matchedPath).filter(item =>
      fs.statSync(path.join(matchedPath, item)).isDirectory()
    );
    
    guestFolders.forEach(guestFolder => {
      const guestPath = path.join(matchedPath, guestFolder);
      const photos = fs.readdirSync(guestPath).filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
      );
      
      photos.forEach(photo => {
        photoOccurrences[photo] = (photoOccurrences[photo] || 0) + 1;
      });
    });
    
    // Convert to array and sort by occurrences
    const popularPhotos = Object.entries(photoOccurrences)
      .map(([name, count]) => ({ name, matchCount: count }))
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 20);
    
    res.json(popularPhotos);
  } catch (error) {
    console.error('Popular photos error:', error);
    res.status(500).json({ error: 'Failed to fetch popular photos' });
  }
});

// 📊 Get monthly comparison data (scoped to authenticated photographer)
app.get("/api/analytics/monthly-comparison", authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const photographerEmail = req.user && req.user.email;
    if (!photographerEmail) return res.status(401).json({ error: 'Unauthorized' });

    // Find event names owned by the photographer
    const userEvents = await Event.find({ photographerEmail }).select('eventName createdAt');
    const userEventNames = userEvents.map(e => e.eventName);

    // This month
    const thisMonthEvents = await Event.countDocuments({ photographerEmail, createdAt: { $gte: thisMonthStart } });
    const thisMonthGuests = userEventNames.length ? await Guest.countDocuments({ eventName: { $in: userEventNames }, createdAt: { $gte: thisMonthStart } }) : 0;

    // Last month
    const lastMonthEvents = await Event.countDocuments({ photographerEmail, createdAt: { $gte: lastMonthStart, $lt: thisMonthStart } });
    const lastMonthGuests = userEventNames.length ? await Guest.countDocuments({ eventName: { $in: userEventNames }, createdAt: { $gte: lastMonthStart, $lt: thisMonthStart } }) : 0;
    
    // Calculate growth
    const eventGrowth = lastMonthEvents > 0 
      ? (((thisMonthEvents - lastMonthEvents) / lastMonthEvents) * 100).toFixed(1)
      : thisMonthEvents > 0 ? 100 : 0;
    
    const guestGrowth = lastMonthGuests > 0 
      ? (((thisMonthGuests - lastMonthGuests) / lastMonthGuests) * 100).toFixed(1)
      : thisMonthGuests > 0 ? 100 : 0;
    
    res.json({
      thisMonth: {
        events: thisMonthEvents,
        guests: thisMonthGuests
      },
      lastMonth: {
        events: lastMonthEvents,
        guests: lastMonthGuests
      },
      growth: {
        events: parseFloat(eventGrowth),
        guests: parseFloat(guestGrowth)
      }
    });
  } catch (error) {
    console.error('Monthly comparison error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly comparison' });
  }
});

// 📊 Get event status distribution for pie chart (scoped to authenticated photographer)
app.get("/api/analytics/status-distribution", authenticateToken, async (req, res) => {
  try {
    const photographerEmail = req.user && req.user.email;
    if (!photographerEmail) return res.status(401).json({ error: 'Unauthorized' });

    const events = await Event.find({ photographerEmail });

    const distribution = {
      active: events.filter(e => e.status === 'active').length,
      processing: events.filter(e => e.status === 'processing').length,
      completed: events.filter(e => e.status === 'completed').length
    };
    
    res.json(distribution);
  } catch (error) {
    console.error('Status distribution error:', error);
    res.status(500).json({ error: 'Failed to fetch status distribution' });
  }
});

// 🔄 Manually update matched photo counts for an event (useful for fixing existing data)
app.post("/api/events/:eventName/update-match-counts", async (req, res) => {
  try {
    const { eventName } = req.params;
    
    console.log(`🔄 Manually updating match counts for event: ${eventName}`);
    await updateGuestMatchedCounts(eventName);
    
    // Get updated stats
    const guests = await Guest.find({ eventName });
    const totalMatches = guests.reduce((sum, g) => sum + g.matchedPhotoCount, 0);
    
    res.json({
      message: 'Match counts updated successfully',
      guestCount: guests.length,
      totalMatches,
      guests: guests.map(g => ({
        email: g.email,
        matchedPhotoCount: g.matchedPhotoCount
      }))
    });
  } catch (error) {
    console.error('Update match counts error:', error);
    res.status(500).json({ error: 'Failed to update match counts' });
  }
});

// ================= MAIN ROUTES =================

// Main route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

// Get cloud storage status
app.get("/api/cloud-storage-status", (req, res) => {
  res.json({
    enabled: useCloudStorage,
    provider: useCloudStorage ? process.env.CLOUD_STORAGE_PROVIDER : 'local',
    initialized: !!cloudStorage
  });
});

// Support Contact Form Endpoint
app.post('/api/support/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    
    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    
    // Get support email from environment or use default
    const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@photoflow.com';
    
    // Prepare email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: supportEmail,
      replyTo: email,
      subject: `[PhotoFlow Support] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5; border-bottom: 3px solid #4f46e5; padding-bottom: 10px;">
            📧 New Support Request
          </h2>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>From:</strong> ${name}</p>
            <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 0;"><strong>Subject:</strong> ${subject}</p>
          </div>
          
          <div style="background: white; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h3 style="color: #1e293b; margin-top: 0;">Message:</h3>
            <p style="color: #475569; line-height: 1.6; white-space: pre-wrap;">${message}</p>
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
            <p style="margin: 0; color: #1e40af; font-size: 14px;">
              💡 <strong>Tip:</strong> Reply directly to this email to contact ${name}
            </p>
          </div>
          
          <div style="margin-top: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
            <p>Sent from PhotoFlow Pro Support System</p>
          </div>
        </div>
      `
    };
    
    // Send email
    await transporter.sendMail(mailOptions);
    
    // Send confirmation to user
    const confirmationOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Thank you for contacting PhotoFlow Support',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5; border-bottom: 3px solid #4f46e5; padding-bottom: 10px;">
            ✅ Message Received
          </h2>
          
          <p style="color: #475569; line-height: 1.6;">Hi ${name},</p>
          
          <p style="color: #475569; line-height: 1.6;">
            Thank you for reaching out to PhotoFlow Support! We've received your message and will get back to you as soon as possible.
          </p>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1e293b; margin-top: 0;">Your Request Summary:</h3>
            <p style="margin: 5px 0;"><strong>Subject:</strong> ${subject}</p>
            <p style="margin: 5px 0;"><strong>Message:</strong></p>
            <p style="color: #64748b; white-space: pre-wrap; margin: 10px 0;">${message}</p>
          </div>
          
          <div style="background: #ecfdf5; padding: 15px; border-left: 4px solid #10b981; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; color: #065f46;">
              ⏱️ <strong>Expected Response Time:</strong> We typically respond within 24-48 hours during business days.
            </p>
          </div>
          
          <p style="color: #475569; line-height: 1.6;">
            Best regards,<br>
            <strong>PhotoFlow Support Team</strong>
          </p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
            <p>📸 PhotoFlow Pro - Smart Event Photography Management</p>
          </div>
        </div>
      `
    };
    
    await transporter.sendMail(confirmationOptions);
    
    res.json({ 
      success: true, 
      message: 'Thank you for contacting us! We\'ve sent a confirmation to your email and will respond soon.' 
    });
    
  } catch (error) {
    console.error('Support form error:', error);
    res.status(500).json({ 
      error: 'Failed to send support message. Please try again later or contact us directly.' 
    });
  }
});

const PORT = process.env.PORT || 5000;

function getNetworkIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const networkIP = getNetworkIP();

// Initialize and start server
async function startServer() {
  await initializeCloudStorage();
  configureMulter();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 PhotoFlow Server Started Successfully!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📍 Local Access:    http://localhost:${PORT}`);
    console.log(`🌐 Network Access:  http://${networkIP}:${PORT}`);
    console.log(`☁️  Cloud Storage:   ${useCloudStorage ? process.env.CLOUD_STORAGE_PROVIDER.toUpperCase() : 'LOCAL'}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n💡 Share the network URL with other devices on the same WiFi\n`);
  });

  try {
    server.requestTimeout = 0;
    server.headersTimeout = 600000;
    server.keepAliveTimeout = 120000;
    server.setTimeout(0);
    console.log('⏱️  Server timeouts adjusted for large uploads');
  } catch (e) {
    console.warn('⚠️ Could not adjust server timeouts:', e.message);
  }
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
