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

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Prevent caching for HTML files
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
  }
  next();
});

app.use(express.static(path.join(__dirname))); // Serve static files (HTML/CSS)

// Detect an available Python command once at startup
function detectPythonCommand() {
  // First, try the virtual environment Python
  const venvPython = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    console.log(`🐍 Using virtual environment Python: ${venvPython}`);
    return { cmd: venvPython, args: [] };
  }

  // Fallback to system Python options
  const candidates = [
    { cmd: "py", args: ["-3"] }, // Windows launcher, force py3
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
    } catch (_) {
      // ignore and try next
    }
  }
  console.warn("⚠️ No working Python interpreter detected. Defaulting to 'python'.");
  return { cmd: "python", args: [] };
}

const PYTHON = detectPythonCommand();
// Set timeout to 0 for unlimited processing time (no timeout)
const PROCESS_TIMEOUT_MS = Number(process.env.PROCESS_TIMEOUT_MS || 0); // 15 min default

// 📦 MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB Error:", err));

// 🧾 Enhanced User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

// 📅 Event Schema
const eventSchema = new mongoose.Schema({
  eventName: { type: String, required: true, unique: true },
  photographerEmail: { type: String, required: true },
  qrCode: String,
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'processing', 'completed'], default: 'active' },
  guestCount: { type: Number, default: 0 },
  photoCount: { type: Number, default: 0 }
});
const Event = mongoose.model("Event", eventSchema);

// 👤 Guest Schema (add processedAt + timestamps to track incremental processing)
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

// 📧 Nodemailer setup
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true for port 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // for Gmail, use an App Password (not your regular password)
  }
});

// Verify SMTP connection at startup for early feedback
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email transporter verification failed:', error.message);
    console.error('   Check EMAIL_USER/EMAIL_PASS (use Gmail App Password) and network access to smtp.gmail.com');
  } else {
    console.log('✅ Email transporter is ready to send messages');
  }
});

// JWT configuration for simple token-based auth (used after OTP verification)
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_this_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function authenticateToken(req, res, next) {
  // Prefer Authorization: Bearer <token>
  const auth = req.headers['authorization'];
  if (!auth) {
    return res.status(401).json({ error: 'Authorization token required' });
  }
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
  }
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

// 📁 Events directory
const EVENTS_DIR = path.join(__dirname, 'events');
if (!fs.existsSync(EVENTS_DIR)) {
  fs.mkdirSync(EVENTS_DIR);
}

// Enhanced multer storage for event-based structure - SANITIZED VERSION
const eventStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { eventName } = req.params;
    const { email } = req.body;
    
    console.log(`📁 Multer destination - Event: ${eventName}, Email: ${email}`);
    
    let folderPath;
    if (req.route.path.includes('selfie') && email) {
      folderPath = path.join(EVENTS_DIR, eventName, 'selfies', email);
    } else {
      folderPath = path.join(EVENTS_DIR, eventName, 'photos');
    }

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`📁 Created directory: ${folderPath}`);
    }
    
    console.log(`📁 Saving file to: ${folderPath}`);
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    // SANITIZE FILENAME - Remove email addresses and special characters
    function sanitizeFilename(filename) {
      // Remove email patterns
      let sanitized = filename.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
      // Remove invalid characters
      sanitized = sanitized.replace(/[\\/:*?"<>|]/g, '_');
      // Remove extra underscores and clean up
      sanitized = sanitized.replace(/_+/g, '_').replace(/^_|_$/g, '');
      // Ensure we have something left
      if (!sanitized || sanitized === '_') {
        sanitized = 'selfie';
      }
      return sanitized;
    }

    const cleanName = sanitizeFilename(file.originalname);
    const filename = Date.now() + '_' + cleanName;
    
    console.log(`📄 Original: ${file.originalname}`);
    console.log(`📄 Sanitized: ${filename}`);
    cb(null, filename);
  }
});

// Configurable max upload size (per file) in MB; 0 disables the limit (use with caution)
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB ?? '1024', 10);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB > 0 ? MAX_UPLOAD_MB * 1024 * 1024 : undefined;

const eventUpload = multer({ 
  storage: eventStorage,
  // Only set limits when we have a positive max; otherwise leave undefined (no Multer file size cap)
  limits: MAX_UPLOAD_BYTES ? { fileSize: MAX_UPLOAD_BYTES } : undefined,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// 📩 OTP Storage (moved outside routes for persistence)
const otps = {};

// ================= USER AUTH ROUTES =================

// 📝 Register route
// Return only events for the authenticated photographer
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

// 📩 Send OTP route (only email)
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

// ✅ Verify OTP
app.post("/api/verify-otp", (req, res) => {
  const { identifier, otp } = req.body;
  if (otps[identifier] === otp) {
    delete otps[identifier]; // clear after success

    // Issue a JWT so the client can authenticate subsequent requests
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

// 📅 Create new event
// Create new event - requires authentication. Photographer email is taken from the authenticated user.
app.post("/api/create-event", authenticateToken, async (req, res) => {
  const { eventName } = req.body;
  const photographerEmail = req.user && req.user.email;

  if (!eventName || !photographerEmail) {
    return res.status(400).json({ error: "Event name and authenticated photographer email required" });
  }

  try {
    // Check if event already exists
    const existingEvent = await Event.findOne({ eventName });
    if (existingEvent) {
      return res.status(400).json({ error: "Event already exists" });
    }

    // Create event folder structure
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

    // Save event to database with authenticated photographer email
    const event = await Event.create({
      eventName,
      photographerEmail,
      qrCode: qrCodeData
    });

    res.json({
      message: "Event created successfully",
      eventName,
      qrCode: qrCodeData,
      qrCodeImage: `/events/${eventName}/qr-code.png`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// Note: Duplicate unprotected GET /api/events removed. Use the authenticated route above to
// ensure only the event owner can see their events.

// �️ Permanently delete an event (DB + filesystem)
// Delete an event - only the event owner (authenticated) may delete their event
app.delete("/api/events/:eventName", authenticateToken, async (req, res) => {
  const { eventName } = req.params;
  try {
    const event = await Event.findOne({ eventName });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.photographerEmail !== req.user.email) {
      return res.status(403).json({ error: 'Not authorized to delete this event' });
    }

    // Remove event and related guests from DB
    const dbResult = await Promise.all([
      Event.deleteOne({ eventName }),
      Guest.deleteMany({ eventName })
    ]);

    // Remove event directory recursively
    const eventPath = path.join(EVENTS_DIR, eventName);
    if (fs.existsSync(eventPath)) {
      await fs.promises.rm(eventPath, { recursive: true, force: true });
    }

    res.json({
      success: true,
      message: `Event '${eventName}' deleted permanently`,
      db: { eventDeleted: dbResult[0]?.deletedCount || 0, guestsDeleted: dbResult[1]?.deletedCount || 0 }
    });
  } catch (error) {
    console.error("Delete event error:", error);
    res.status(500).json({ error: "Failed to delete event", details: error.message });
  }
});

// 📤 Upload event photos (photographer) with explicit Multer error handling
app.post("/api/upload-event-photos/:eventName", (req, res) => {
  console.log(`📤 Upload event photos request: eventName=${req.params.eventName}`);
  eventUpload.array("photos", 10000)(req, res, async (err) => {
    if (err) {
      // Multer error handling
      if (err.code === 'LIMIT_FILE_SIZE') {
        console.error('❌ Upload error: file too large');
        return res.status(400).json({ error: MAX_UPLOAD_MB > 0 ? `File too large. Max ${MAX_UPLOAD_MB}MB per photo.` : 'File too large.' });
      }
      console.error('❌ Upload error:', err.message || err);
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }

    const { eventName } = req.params;
    const filesCount = (req.files || []).length;
    console.log(`✅ Files received: ${filesCount}`);
    if (!filesCount) return res.status(400).json({ error: 'No photos uploaded' });

    try {
      await Event.findOneAndUpdate(
        { eventName },
        { $inc: { photoCount: filesCount } }
      );
      res.json({ message: `${filesCount} photos uploaded successfully`, photoCount: filesCount });
    } catch (error) {
      console.error('❌ DB update after upload failed:', error);
      res.status(500).json({ error: 'Failed to record upload in database' });
    }
  });
});

// 📱 Guest selfie upload - ENHANCED VERSION
app.post("/api/upload-selfie/:eventName", (req, res, next) => {
  console.log(`🔍 Upload selfie request: eventName=${req.params.eventName}`);
  console.log(`🔍 Request body before multer:`, req.body);
  
  // Use the eventUpload middleware
  eventUpload.array("selfies", 5)(req, res, async (err) => {
    if (err) {
      console.error(`❌ Multer error:`, err);
      return res.status(400).json({ error: err.message });
    }

    const { eventName } = req.params;
    const { email } = req.body;
    
    console.log(`🔍 After multer - eventName: ${eventName}, email: ${email}`);
    console.log(`🔍 Files received:`, req.files ? req.files.length : 0);
    
    if (!email || !req.files || req.files.length === 0) {
      console.log(`❌ Missing data: email=${email}, files=${req.files ? req.files.length : 0}`);
      return res.status(400).json({ error: "Email and selfie required" });
    }

    try {
      // Check if event exists
      const event = await Event.findOne({ eventName });
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Create or update guest record
      const guest = await Guest.findOneAndUpdate(
        { email, eventName },
        {
          $inc: { selfieCount: req.files.length },
          $setOnInsert: { email, eventName }
        },
        { upsert: true, new: true }
      );

      // Update event guest count if new guest
      if (guest.selfieCount === req.files.length) {
        await Event.findOneAndUpdate(
          { eventName },
          { $inc: { guestCount: 1 } }
        );
      }

      console.log(`✅ Successfully uploaded ${req.files.length} selfies for ${email}`);
      console.log(`📁 Files saved to: ${req.files[0].path}`);

      res.json({
        message: `${req.files.length} selfie(s) uploaded successfully`,
        email,
        selfieCount: guest.selfieCount,
        filesUploaded: req.files.map(f => ({
          filename: f.filename,
          path: f.path,
          size: f.size
        }))
      });
    } catch (error) {
      console.error(`❌ Database error:`, error);
      res.status(500).json({ error: "Failed to upload selfie" });
    }
  });
});

// 🧠 Process event (face matching) - ENHANCED VERSION
app.post("/api/process-event/:eventName", async (req, res) => {
  const { eventName } = req.params;
  // Optional tuning params for face matching
  const tol = parseFloat(req.body?.tolerance ?? req.query?.tolerance ?? '');
  const margin = parseFloat(req.body?.margin ?? req.query?.margin ?? '');
  const cnn = req.body?.cnn ?? req.query?.cnn; // '0' or '1'
  const args = [];
  if (!Number.isNaN(tol)) args.push(String(tol));
  if (!Number.isNaN(margin)) args.push(String(margin));
  if (cnn === '0' || cnn === '1' || typeof cnn === 'number') {
    // Ensure we pass only 0 or 1
    const val = String(cnn);
    if (val === '0' || val === '1') args.push(val);
  }

  try {
    // Update event status
    await Event.findOneAndUpdate({ eventName }, { status: 'processing' });

            // Use the FAST face matching script for better performance
            const pythonScript = path.join(__dirname, 'deepface_match_fixed.py');
            const eventPath = path.join(EVENTS_DIR, eventName);

            // Enhanced debugging
            console.log(`🔍 Python script path: ${pythonScript}`);
            console.log(`📁 Event path: ${eventPath}`);
            console.log(`📂 Script exists: ${fs.existsSync(pythonScript)}`);
            console.log(`📂 Event exists: ${fs.existsSync(eventPath)}`);    // Check for selfies BEFORE processing
    const selfiesPath = path.join(eventPath, 'selfies');
    let guestCount = 0;
    if (fs.existsSync(selfiesPath)) {
      const guestFolders = fs.readdirSync(selfiesPath).filter(item =>
        fs.statSync(path.join(selfiesPath, item)).isDirectory()
      );
      guestCount = guestFolders.length;
      console.log(`👥 Guest folders found: ${guestCount}`);
      console.log(`👥 Guest emails: ${guestFolders.join(', ')}`);
    }

    if (guestCount === 0) {
      await Event.findOneAndUpdate({ eventName }, { status: 'active' });
      return res.status(400).json({
        error: "No guest selfies found",
        message: "Please ensure guests have uploaded selfies before processing",
        selfiesPath: selfiesPath
      });
    }

    // Check for photos BEFORE processing
    const photosPath = path.join(eventPath, 'photos');
    let photoCount = 0;
    if (fs.existsSync(photosPath)) {
      photoCount = fs.readdirSync(photosPath).filter(file => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)).length;
    }
    if (photoCount === 0) {
      await Event.findOneAndUpdate({ eventName }, { status: 'active' });
      return res.status(400).json({
        error: "No photos found",
        message: "Please upload event photos before processing",
        photosPath: photosPath
      });
    }

            // Filter out undefined/null values and prepare arguments
            const scriptArgs = [eventPath];
            if (typeof args[0] === 'string' && args[0] !== 'undefined') {
                scriptArgs.push(args[0]);
            }

            console.log(`🐍 Starting Python process with: ${PYTHON.cmd} ${PYTHON.args.join(' ')}`);
            console.log(`🚀 deepface_match_fixed.py args:`, scriptArgs);
            console.log(`⚡ Using optimized face matching for faster processing...`);

            const pythonProcess = spawn(PYTHON.cmd, [...PYTHON.args, pythonScript, ...scriptArgs], {
                cwd: __dirname,
                env: { ...process.env }
            });    let outputData = '';
    let errorData = '';

    // Kill process if it hangs (only if timeout is set)
    let killTimer = null;
    if (PROCESS_TIMEOUT_MS > 0) {
      killTimer = setTimeout(async () => {
        console.error(`⏱️ Python process timeout after ${PROCESS_TIMEOUT_MS}ms. Killing process...`);
        try { pythonProcess.kill('SIGKILL'); } catch (_) {}
      }, PROCESS_TIMEOUT_MS);
    } else {
      console.log(`⏱️  No timeout set - process will run until completion`);
    }

    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
      console.log(`Python output: ${data}`);
    });

    // pythonProcess.stderr.on('data', (data) => {
    //   errorData += data.toString();
    //   console.error(`Python error: ${data}`);
    // });

    pythonProcess.on('close', async (code) => {
      if (killTimer) clearTimeout(killTimer);
      console.log(`Python process exited with code: ${code}`);
      console.log(`Full output: ${outputData}`);
      
      if (errorData) {
        console.log(`Full errors: ${errorData}`);
      }

      if (code === 0) {
        await Event.findOneAndUpdate({ eventName }, { status: 'completed' });
        // Mark guests as processed now; next uploads will bump updatedAt and show as pending again
        await Guest.updateMany({ eventName, selfieCount: { $gt: 0 } }, { $set: { processedAt: new Date() } });
        await generateZipFilesAndSendEmails(eventName);
        res.json({ 
          message: "Event processing completed successfully", 
          output: outputData,
          guestCount: guestCount
        });
      } else {
        await Event.findOneAndUpdate({ eventName }, { status: 'active' });
        res.status(500).json({
          error: "Face recognition processing failed",
          details: errorData,
          output: outputData,
          exitCode: code,
          pythonCommand: `${PYTHON.cmd} ${PYTHON.args.join(' ')}`
        });
      }
    });

    pythonProcess.on('error', async (error) => {
      console.error(`Failed to start Python process: ${error}`);
      await Event.findOneAndUpdate({ eventName }, { status: 'active' });
      res.status(500).json({
        error: "Failed to start face recognition process",
        details: error.message,
        pythonScript: pythonScript,
        eventPath: eventPath,
        suggestion: "Install Python 3, add it to PATH, or ensure 'py' launcher is available on Windows"
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

// 🔎 Pending guests for an event: selfies exist AND (never processed OR updated after last process)
app.get('/api/events/:eventName/pending-guests-count', async (req, res) => {
  const { eventName } = req.params;
  try {
    const pending = await Guest.countDocuments({
      eventName,
      selfieCount: { $gt: 0 },
      $or: [
        { processedAt: { $exists: false } },
        { processedAt: null },
        { $expr: { $gt: ["$updatedAt", "$processedAt"] } }
      ]
    });
    res.json({ eventName, pending });
  } catch (e) {
    console.error('Failed to fetch pending guests:', e);
    res.status(500).json({ error: 'Failed to fetch pending guests' });
  }
});

// 📦 Generate zip files and send emails
async function generateZipFilesAndSendEmails(eventName) {
  try {
    const guests = await Guest.find({ eventName });
    if (!guests || guests.length === 0) {
      console.log('⚠️ No guests found for event:', eventName);
      return;
    }

    const eventPath = path.join(EVENTS_DIR, eventName);
    if (!fs.existsSync(eventPath)) {
      throw new Error(`Event path does not exist: ${eventPath}`);
    }

    // Ensure exports directory exists
    const exportsPath = path.join(eventPath, 'exports');
    if (!fs.existsSync(exportsPath)) {
      fs.mkdirSync(exportsPath, { recursive: true });
      console.log(`📦 Created exports directory: ${exportsPath}`);
    }

    console.log(`🔄 Processing ${guests.length} guests for event: ${eventName}`);
    for (const guest of guests) {
      const guestMatchedPath = path.join(eventPath, 'matched', guest.email);
      const zipPath = path.join(eventPath, 'exports', `${guest.email}.zip`);
      
      console.log(`\n📎 Processing guest: ${guest.email}`);
      console.log(`📂 Matched photos path: ${guestMatchedPath}`);

      if (fs.existsSync(guestMatchedPath)) {
        // Check if there are any matched photos
        const matchedPhotos = fs.readdirSync(guestMatchedPath);
        if (matchedPhotos.length === 0) {
          console.log(`⚠️ No matched photos found for guest: ${guest.email}`);
          continue;
        }

        console.log(`📸 Found ${matchedPhotos.length} matched photos for ${guest.email}`);
        
        try {
          // Remove existing zip if it exists
          if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
            console.log(`🗑️ Removed existing zip file for ${guest.email}`);
          }

          // Create zip file
          await createZipFile(guestMatchedPath, zipPath);
          
          // Verify the zip file
          const zipStats = fs.statSync(zipPath);
          if (zipStats.size === 0) {
            throw new Error('Created zip file is empty');
          }
          
          // Verify zip contains the expected number of files
          console.log(`✅ Zip created for ${guest.email}: ${zipPath} (${zipStats.size} bytes)`);
          console.log(`📋 Contains ${matchedPhotos.length} matched photos`);

          // Simple zip verification by checking file size and existence
          if (fs.existsSync(zipPath) && zipStats.size > 0) {
            console.log(`✅ Zip file verified: ${path.basename(zipPath)} (${(zipStats.size / 1024 / 1024).toFixed(2)} MB)`);
          } else {
            throw new Error('Zip file verification failed');
          }

          // Send email with ZIP file attachment
          if (process.env.EMAIL_ENABLED && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            try {
              console.log(`✉️ Sending email with ZIP attachment to ${guest.email} ...`);
              await sendGuestEmail(guest.email, eventName, zipPath);
              console.log(`✅ Email with ZIP attachment sent to ${guest.email}`);
            } catch (emailError) {
              console.error(`❌ Failed to send email to ${guest.email}:`, emailError.message);
              // Continue processing other guests even if email fails
            }
          } else {
            console.log(`✉️ Skipping email to ${guest.email}: EMAIL_ENABLED=${process.env.EMAIL_ENABLED}, creds present=${!!process.env.EMAIL_USER && !!process.env.EMAIL_PASS}`);
          }

          // Update guest record
          await Guest.findOneAndUpdate(
            { email: guest.email, eventName },
            { zipGenerated: true, emailSent: process.env.EMAIL_ENABLED && !!process.env.EMAIL_USER && !!process.env.EMAIL_PASS }
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

// 📦 Create zip file
function createZipFile(sourcePath, outputPath) {
  return new Promise((resolve, reject) => {
    let tempDir = null;
    let archive = null;
    
    try {
      // Verify source path exists and has files
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source path does not exist: ${sourcePath}`);
      }

      const files = fs.readdirSync(sourcePath);
      if (files.length === 0) {
        throw new Error(`No files found in source path: ${sourcePath}`);
      }

      // Create output directory if it doesn't exist
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Create a temporary directory for organizing files
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photoai-zip-'));
      const photosDir = path.join(tempDir, 'matched_photos');
      fs.mkdirSync(photosDir);

      // Copy and organize files
      let photoCount = 0;
      for (const file of files) {
        const sourcefile = path.join(sourcePath, file);
        const destFile = path.join(photosDir, file);
        fs.copyFileSync(sourcefile, destFile);
        photoCount++;
      }

      // Create a metadata file
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
        const stats = fs.statSync(outputPath);
        console.log(`📦 Archive created: ${outputPath} (${stats.size} bytes)`);
        
        // Clean up temp directory
        if (tempDir) {
          try {
            fs.rmSync(tempDir, { recursive: true });
          } catch (err) {
            console.warn('⚠️ Failed to clean up temp directory:', err);
          }
        }
        
        resolve();
      });

      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          console.warn('⚠️ Zip warning:', err);
        } else {
          throw err;
        }
      });

      archive.on('error', (err) => {
        throw err;
      });

      // Add a README file
      const readmeContent = `Thank you for using our photo matching service!

Event: ${metadata.event}
Total Photos: ${metadata.totalPhotos}
Generated: ${new Date().toLocaleString()}

This zip file contains:
- matched_photos/: All photos that matched your selfie
- metadata.json: Technical details about the matching process
`;
      archive.append(readmeContent, { name: 'README.txt' });

      // Pipe archive data to the output file
      archive.pipe(output);

      // Add the organized content to the archive
      archive.directory(tempDir, false);

      // Handle archive error before finalizing
      archive.on('error', (err) => {
        output.end();
        if (tempDir) {
          try {
            fs.rmSync(tempDir, { recursive: true });
          } catch (cleanupErr) {
            console.warn('⚠️ Failed to clean up temp directory:', cleanupErr);
          }
        }
        reject(err);
      });

      // Finalize the archive
      archive.finalize();
    } catch (error) {
      // Clean up temp directory on error
      if (tempDir) {
        try {
          fs.rmSync(tempDir, { recursive: true });
        } catch (cleanupErr) {
          console.warn('⚠️ Failed to clean up temp directory after error:', cleanupErr);
        }
      }
      // If archive was created, abort it
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

// 📧 Send email to guest
async function sendGuestEmail(guestEmail, eventName, zipPath) {
  // Verify the ZIP file exists before sending
  if (!fs.existsSync(zipPath)) {
    console.error(`❌ ZIP file not found for email: ${zipPath}`);
    throw new Error(`ZIP file not found: ${zipPath}`);
  }

  // Check file size (optional: warn if too large for email)
  const stats = fs.statSync(zipPath);
  const fileSizeMB = stats.size / (1024 * 1024);
  if (fileSizeMB > 25) {
    console.warn(`⚠️ Large ZIP file (${fileSizeMB.toFixed(2)} MB) for ${guestEmail} - may exceed email limits`);
  }

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
}

// 📥 Download guest photos - Enhanced with better error handling and logging
app.get("/download/:eventName/:email", (req, res) => {
  const { eventName, email } = req.params;
  const zipPath = path.join(EVENTS_DIR, eventName, 'exports', `${email}.zip`);

  console.log(`📥 Download request from ${req.ip} for event: ${eventName}, email: ${email}`);
  console.log(`📂 Looking for zip at: ${zipPath}`);

  if (fs.existsSync(zipPath)) {
    const stats = fs.statSync(zipPath);
    console.log(`✅ Zip file found: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Set proper headers for cross-device download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${eventName}_${email.replace('@', '_')}.zip"`);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    // Stream the file for better performance with large files
    const fileStream = fs.createReadStream(zipPath);
    fileStream.on('error', (error) => {
      console.error(`❌ Error streaming file: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    });
    
    fileStream.pipe(res);
    
    console.log(`📤 Streaming zip file to client...`);
  } else {
    console.error(`❌ Zip file not found at: ${zipPath}`);
    res.status(404).json({ 
      error: "Photos not found",
      message: "The requested photo album could not be found. Please contact the event organizer.",
      eventName,
      email
    });
  }
});

// 🌐 Guest upload page
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

// 📊 Get event statistics
app.get("/api/event-stats/:eventName", async (req, res) => {
  const { eventName } = req.params;

  try {
    const eventPath = path.join(EVENTS_DIR, eventName);
    const photosPath = path.join(eventPath, 'photos');
    const matchedPath = path.join(eventPath, 'matched');

    let totalPhotos = 0;
    let totalGuests = 0;
    let totalMatches = 0;

    // Count total photos
    if (fs.existsSync(photosPath)) {
      const photoFiles = fs.readdirSync(photosPath).filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
      );
      totalPhotos = photoFiles.length;
    }

    // Count guests and matches
    if (fs.existsSync(matchedPath)) {
      const guestFolders = fs.readdirSync(matchedPath).filter(item =>
        fs.statSync(path.join(matchedPath, item)).isDirectory()
      );
      totalGuests = guestFolders.length;

      // Count total matched photos
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
      totalMatches
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get event statistics" });
  }
});

// 👥 Get list of guests with matched photos for an event - NEW ROUTE
app.get("/api/guests/:eventName", (req, res) => {
  const { eventName } = req.params;

  try {
    const matchedPath = path.join(EVENTS_DIR, eventName, 'matched');

    if (!fs.existsSync(matchedPath)) {
      return res.json([]);
    }

    // Get all guest folders (which are named with their email addresses)
    const guestFolders = fs.readdirSync(matchedPath).filter(item => {
      const itemPath = path.join(matchedPath, item);
      return fs.statSync(itemPath).isDirectory();
    });

    // Count photos for each guest
    const guestData = guestFolders.map(guestEmail => {
      const guestPath = path.join(matchedPath, guestEmail);
      const photoFiles = fs.readdirSync(guestPath).filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
      );

      return {
        email: guestEmail,
        photoCount: photoFiles.length,
        displayName: guestEmail // Show actual email as display name
      };
    });

    console.log(`📊 Found ${guestData.length} guests for ${eventName}:`, guestData.map(g => g.email));
    res.json(guestData);

  } catch (error) {
    console.error(`Error getting guests for ${eventName}:`, error);
    res.status(500).json({ error: "Failed to get guest list" });
  }
});

// 👥 Get guest folders
app.get("/api/guest-folders/:eventName", async (req, res) => {
  const { eventName } = req.params;

  try {
    const matchedPath = path.join(EVENTS_DIR, eventName, 'matched');

    if (!fs.existsSync(matchedPath)) {
      return res.json([]);
    }

    const guestFolders = fs.readdirSync(matchedPath).filter(item =>
      fs.statSync(path.join(matchedPath, item)).isDirectory()
    );

    const guests = guestFolders.map(guestEmail => {
      const guestPath = path.join(matchedPath, guestEmail);
      const photoFiles = fs.readdirSync(guestPath).filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
      );

      return {
        email: guestEmail,
        photoCount: photoFiles.length
      };
    });

    res.json(guests);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get guest folders" });
  }
});

// 📷 Get all event photos
app.get("/api/event-photos/:eventName", async (req, res) => {
  const { eventName } = req.params;

  try {
    const photosPath = path.join(EVENTS_DIR, eventName, 'photos');

    if (!fs.existsSync(photosPath)) {
      return res.json([]);
    }

    const photoFiles = fs.readdirSync(photosPath).filter(file =>
      /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
    );

    const photos = photoFiles.map(filename => ({
      name: filename,
      path: `/events/${eventName}/photos/${filename}`
    }));

    res.json(photos);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get event photos" });
  }
});

// � List guests who have uploaded selfies for an event
app.get('/api/selfie-guests/:eventName', async (req, res) => {
  const { eventName } = req.params;
  try {
    const selfiesPath = path.join(EVENTS_DIR, eventName, 'selfies');
    if (!fs.existsSync(selfiesPath)) return res.json([]);
    const guests = fs.readdirSync(selfiesPath)
      .filter(item => fs.statSync(path.join(selfiesPath, item)).isDirectory())
      .map(email => {
        const files = fs.readdirSync(path.join(selfiesPath, email)).filter(f => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f));
        return { email, selfieCount: files.length };
      });
    res.json(guests);
  } catch (e) {
    console.error('Error listing selfie guests:', e);
    res.status(500).json({ error: 'Failed to list selfie guests' });
  }
});

// 📸 Get selfies for a specific guest
app.get('/api/selfies/:eventName/:guestEmail', async (req, res) => {
  const { eventName, guestEmail } = req.params;
  try {
    const guestPath = path.join(EVENTS_DIR, eventName, 'selfies', guestEmail);
    if (!fs.existsSync(guestPath)) return res.json([]);
    const files = fs.readdirSync(guestPath).filter(f => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f));
    const selfies = files.map(filename => ({
      name: filename,
      path: `/events/${eventName}/selfies/${encodeURIComponent(guestEmail)}/${filename}`
    }));
    res.json(selfies);
  } catch (e) {
    console.error('Error listing selfies:', e);
    res.status(500).json({ error: 'Failed to list selfies' });
  }
});

// �📸 Get photos for a specific guest - ENHANCED VERSION
app.get("/api/guest-photos/:eventName/:guestEmail", (req, res) => {
  const { eventName, guestEmail } = req.params;

  try {
    const guestPath = path.join(EVENTS_DIR, eventName, 'matched', guestEmail);

    if (!fs.existsSync(guestPath)) {
      return res.json([]);
    }

    // Get all photo files for this guest
    const photoFiles = fs.readdirSync(guestPath).filter(file =>
      /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
    );

    // Return photo data with full paths
    const photos = photoFiles.map(filename => ({
      name: filename,
      path: `/events/${eventName}/matched/${guestEmail}/${filename}`,
      url: `${req.protocol}://${req.get('host')}/events/${eventName}/matched/${guestEmail}/${filename}`
    }));

    console.log(`📷 Found ${photos.length} photos for guest ${guestEmail} in ${eventName}`);
    res.json(photos);

  } catch (error) {
    console.error(`Error getting photos for guest ${guestEmail} in ${eventName}:`, error);
    res.status(500).json({ error: "Failed to get guest photos" });
  }
});

// 🧹 Helper to safely delete a file
function safeUnlink(filePath) {
  return fs.promises.unlink(filePath).then(() => true).catch((e) => {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return false;
    throw e;
  });
}

// 🗑️ Delete a photo from a guest collection (soft or permanent)
// Soft: removes only from matched/<guestEmail>/ (keeps original in photos)
// Permanent: also removes from photos/ and from other guests' matched folders
app.delete('/api/guest-photo/:eventName/:guestEmail/:fileName', async (req, res) => {
  const { eventName, guestEmail, fileName } = req.params;
  const mode = (req.query.mode || 'soft').toLowerCase(); // 'soft' | 'permanent'
  try {
    const eventPath = path.join(EVENTS_DIR, eventName);
    const matchedDir = path.join(eventPath, 'matched');
    const guestFile = path.join(matchedDir, guestEmail, fileName);

    // Always remove from this guest's matched folder
    await safeUnlink(guestFile);

    if (mode === 'permanent') {
      // Remove original source (if exists)
      const sourceFile = path.join(eventPath, 'photos', fileName);
      const removedSource = await safeUnlink(sourceFile);

      // Remove from any other guest matched folders with same filename
      if (fs.existsSync(matchedDir)) {
        const guestFolders = fs.readdirSync(matchedDir).filter(d => fs.statSync(path.join(matchedDir, d)).isDirectory());
        for (const folder of guestFolders) {
          if (folder === guestEmail) continue;
          const other = path.join(matchedDir, folder, fileName);
          await safeUnlink(other);
        }
      }

      // Decrement event photoCount if we removed from photos
      if (removedSource) {
        await Event.findOneAndUpdate({ eventName }, { $inc: { photoCount: -1 } });
      }
    }

    res.json({ success: true, mode, fileName });
  } catch (error) {
    console.error('Delete guest photo error:', error);
    res.status(500).json({ error: 'Failed to delete photo', details: error.message });
  }
});

// 🗑️ Delete a photo from the event (All Photos). Always permanent for source; also cleans all matched copies
app.delete('/api/event-photo/:eventName/:fileName', async (req, res) => {
  const { eventName, fileName } = req.params;
  try {
    const eventPath = path.join(EVENTS_DIR, eventName);
    const photosDir = path.join(eventPath, 'photos');
    const matchedDir = path.join(eventPath, 'matched');

    // Remove source
    const sourceFile = path.join(photosDir, fileName);
    const removedSource = await safeUnlink(sourceFile);

    // Remove from all matched folders
    if (fs.existsSync(matchedDir)) {
      const guestFolders = fs.readdirSync(matchedDir).filter(d => fs.statSync(path.join(matchedDir, d)).isDirectory());
      for (const folder of guestFolders) {
        const f = path.join(matchedDir, folder, fileName);
        await safeUnlink(f);
      }
    }

    if (removedSource) {
      await Event.findOneAndUpdate({ eventName }, { $inc: { photoCount: -1 } });
    }

    res.json({ success: true, fileName });
  } catch (error) {
    console.error('Delete event photo error:', error);
    res.status(500).json({ error: 'Failed to delete event photo', details: error.message });
  }
});

// 📥 Download entire event as zip
app.get("/api/download-event/:eventName", async (req, res) => {
  const { eventName } = req.params;

  try {
    const eventPath = path.join(EVENTS_DIR, eventName);
    const zipPath = path.join(eventPath, 'exports', `${eventName}_complete.zip`);

    // Create exports directory if it doesn't exist
    const exportsPath = path.join(eventPath, 'exports');
    if (!fs.existsSync(exportsPath)) {
      fs.mkdirSync(exportsPath, { recursive: true });
    }

    // Create zip file
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      res.download(zipPath, `${eventName}_complete.zip`);
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(output);

    // Add all photos
    const photosPath = path.join(eventPath, 'photos');
    if (fs.existsSync(photosPath)) {
      archive.directory(photosPath, 'all_photos');
    }

    // Add matched photos by guest
    const matchedPath = path.join(eventPath, 'matched');
    if (fs.existsSync(matchedPath)) {
      archive.directory(matchedPath, 'matched_by_guest');
    }

    // Add processing report if exists
    const reportPath = path.join(eventPath, 'processing_report.json');
    if (fs.existsSync(reportPath)) {
      archive.file(reportPath, { name: 'processing_report.json' });
    }

    archive.finalize();

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create download" });
  }
});

// 🖼️ Serve event files statically
app.use('/events', express.static(EVENTS_DIR));

// ================= ANALYTICS API ROUTES =================

// 📊 Get comprehensive analytics data (scoped to authenticated photographer)
app.get("/api/analytics/overview", authenticateToken, async (req, res) => {
  try {
    const photographerEmail = req.user && req.user.email;
    if (!photographerEmail) return res.status(401).json({ error: 'Unauthorized' });

    const events = await Event.find({ photographerEmail });
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

// 📈 Get time-series data for charts
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

// 🏆 Get top performing events
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

// 📸 Get popular photos (most matched)
app.get("/api/analytics/popular-photos/:eventName", authenticateToken, async (req, res) => {
  try {
    const { eventName } = req.params;
    const photographerEmail = req.user && req.user.email;
    if (!photographerEmail) return res.status(401).json({ error: 'Unauthorized' });

    const event = await Event.findOne({ eventName });
    if (!event) return res.status(404).json([]);
    if (event.photographerEmail !== photographerEmail) return res.status(403).json({ error: 'Not authorized to view analytics for this event' });

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

// 📊 Get monthly comparison data
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

// 📊 Get event status distribution for pie chart
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

// ================= MAIN ROUTES =================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

// 🔄 On-demand regenerate exports and optionally resend emails
app.post('/api/regenerate-exports/:eventName', async (req, res) => {
  const { eventName } = req.params;
  const { resendEmails } = req.body || {};
  try {
    console.log(`🔄 Regenerating exports for event: ${eventName}. Resend emails: ${!!resendEmails}`);
    await generateZipFilesAndSendEmails(eventName);
    if (resendEmails && process.env.EMAIL_ENABLED && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      // generateZipFilesAndSendEmails already sends emails; this flag is informational
      console.log('✉️ Emails already sent during regeneration (flag enabled).');
    }
    res.json({ success: true, message: 'Exports regenerated', resendEmails: !!resendEmails });
  } catch (e) {
    console.error('Regenerate exports failed:', e);
    res.status(500).json({ error: 'Failed to regenerate exports', details: e.message });
  }
});

// Public upload config for client-side validation
app.get('/api/upload-config', (req, res) => {
  res.json({
    maxUploadMB: MAX_UPLOAD_MB > 0 ? MAX_UPLOAD_MB : null, // null = unlimited
    maxFilesPerRequest: 2000
  });
});

// Global error handler to always return JSON (prevents HTML error pages)
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: `File too large. Max ${MAX_UPLOAD_MB}MB per photo.` });
  }
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }
 
  res.status(500).json({ error: err?.message || 'Server error' });
});

// ▶️ Run the user's simple face match script (simple_match.py)
// Place the unmodified script at: photoAi/simple_match.py
app.post('/api/simple-match/run', async (req, res) => {
  try {
    const scriptPath = path.join(__dirname, 'simple_match.py');
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: 'simple_match.py not found. Please place the provided script at photoAi/simple_match.py' });
    }

    console.log('🔧 Launching simple_match.py');
    const proc = spawn(PYTHON.cmd, [...PYTHON.args, scriptPath], {
      cwd: __dirname,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { const s = d.toString(); stdout += s; process.stdout.write(s); });
    proc.stderr.on('data', (d) => { const s = d.toString(); stderr += s; process.stderr.write(s); });

    const timeoutMs = Number(process.env.SIMPLE_MATCH_TIMEOUT_MS || 30 * 60 * 1000); // 30 min default
    const killer = setTimeout(() => {
      console.warn('⏱️ simple_match.py timed out, killing process');
      try { proc.kill('SIGKILL'); } catch (_) {}
    }, timeoutMs);

    proc.on('close', async (code) => {
      clearTimeout(killer);
      if (code === 0) {
        try {
          const { eventName } = req.query;
          if (eventName) {
            // Mark all current selfies for this event as processed at this time
            const now = new Date();
            await Guest.updateMany({ eventName, selfieCount: { $gt: 0 } }, { $set: { processedAt: now } });
          }
        } catch (e) {
          console.warn('Could not update processedAt after simple match:', e.message);
        }
        return res.json({ success: true, code, stdout });
      }
      return res.status(500).json({ success: false, code, stdout, stderr });
    });
  } catch (e) {
    console.error('Failed to run simple_match.py:', e);
    res.status(500).json({ error: 'Failed to run simple_match.py', details: e.message });
  }
});

const PORT = process.env.PORT || 5000;

// Get network IP address for display
function getNetworkIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const networkIP = getNetworkIP();

// Listen on all network interfaces (0.0.0.0) to allow access from other devices
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 PhotoFlow Server Started Successfully!`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📍 Local Access:    http://localhost:${PORT}`);
  console.log(`🌐 Network Access:  http://${networkIP}:${PORT}`);
  console.log(`⬆️  Max Upload:      ${MAX_UPLOAD_MB > 0 ? MAX_UPLOAD_MB + 'MB' : 'UNLIMITED'} per file`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\n💡 Share the network URL with other devices on the same WiFi`);
  console.log(`📧 Make sure BASE_URL in .env is set to: http://${networkIP}:${PORT}\n`);
});

// Increase server timeouts for large uploads
try {
  // Disable request timeout; allow long-running uploads
  server.requestTimeout = 0; // Node 18+
  // Keep header timeout generous
  server.headersTimeout = 600000; // 10 minutes
  // Keep-alive timeout for slow clients
  server.keepAliveTimeout = 120000; // 2 minutes
  // Legacy setTimeout (socket idle timeout); 0 to disable
  server.setTimeout(0);
  console.log('⏱️  Server timeouts adjusted for large uploads');
} catch (e) {
  console.warn('⚠️ Could not adjust server timeouts:', e.message);
}
