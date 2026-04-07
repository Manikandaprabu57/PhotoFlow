# 🌐 Setup Network Access for Photo Downloads

## Problem
The download links in emails are using `localhost:5000` which only works on your computer. Other devices can't access localhost.

## Solution

### Step 1: Update your .env file

Open your `.env` file and update the `BASE_URL` to use your network IP address:

```env
# Change from:
BASE_URL=http://localhost:5000

# To (use your actual network IP):
BASE_URL=http://192.168.29.182:5000
```

**Your current network IP is: `192.168.29.182`**

### Step 2: Ensure your server is listening on all network interfaces

In your `app.js`, make sure the server listens on `0.0.0.0` instead of just `localhost`:

```javascript
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`🌐 Access from other devices: http://192.168.29.182:${PORT}`);
});
```

### Step 3: Configure Windows Firewall

Allow Node.js through Windows Firewall:

1. Open **Windows Defender Firewall**
2. Click **"Allow an app or feature through Windows Defender Firewall"**
3. Click **"Change settings"** (requires admin)
4. Click **"Allow another app..."**
5. Browse and select `node.exe` (usually in `C:\Program Files\nodejs\node.exe`)
6. Make sure both **Private** and **Public** checkboxes are checked
7. Click **OK**

### Step 4: Test from another device

1. Make sure both devices are on the same WiFi network
2. On another device, open a browser and go to:
   ```
   http://192.168.29.182:5000
   ```
3. You should see your PhotoFlow application

### Step 5: Restart your server

After making changes to `.env`, restart your Node.js server:

```bash
# Stop the current server (Ctrl+C)
# Then restart it
npm start
# or
node app.js
```

## Testing Downloads

1. Process an event with guest selfies
2. Check the email sent to guests
3. The download link should now be: `http://192.168.29.182:5000/download/EventName/guest@email.com`
4. Click the link from any device on the same network - it should download the zip file

## Troubleshooting

### Downloads still not working?

1. **Check if server is accessible:**
   - From another device, try: `http://192.168.29.182:5000`
   - You should see the PhotoFlow homepage

2. **Check firewall:**
   - Temporarily disable Windows Firewall to test
   - If it works, add proper firewall rules

3. **Check the zip file exists:**
   - Look in: `events/[EventName]/exports/[email].zip`
   - Make sure the file was created during processing

4. **Check server logs:**
   - Look for download request logs in your terminal
   - Should show: `📥 Download request from [IP] for event: ...`

5. **Network IP changed?**
   - Your IP might change if you reconnect to WiFi
   - Run `ipconfig` again to check your current IP
   - Update `.env` if needed

## For Public Access (Optional)

If you want people outside your local network to download:

### Option 1: Use ngrok (Easiest)
```bash
# Install ngrok
npm install -g ngrok

# Run ngrok
ngrok http 5000

# Use the ngrok URL in your .env
BASE_URL=https://abc123.ngrok.io
```

### Option 2: Deploy to a cloud service
- Deploy to Heroku, Railway, Render, or similar
- Update BASE_URL to your deployment URL

## Current Improvements Made

✅ Enhanced download route with:
- Better error handling and logging
- Proper CORS headers for cross-device access
- File streaming for large files
- Detailed error messages
- Request logging to track download attempts

✅ The download endpoint now:
- Logs all download requests with IP addresses
- Shows file size before streaming
- Handles errors gracefully
- Provides helpful error messages
