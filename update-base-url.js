#!/usr/bin/env node
/**
 * Quick script to update BASE_URL in .env file
 * Run: node update-base-url.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Get network IP address
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
  return null;
}

const networkIP = getNetworkIP();
const PORT = process.env.PORT || 5000;
const envPath = path.join(__dirname, '.env');

console.log('\n🔍 Network Configuration Check\n');
console.log('='.repeat(50));

if (!networkIP) {
  console.log('❌ Could not detect network IP address');
  console.log('   Make sure you are connected to WiFi');
  process.exit(1);
}

console.log(`✅ Network IP detected: ${networkIP}`);
console.log(`📡 Recommended BASE_URL: http://${networkIP}:${PORT}`);
console.log('='.repeat(50));

if (!fs.existsSync(envPath)) {
  console.log('\n❌ .env file not found!');
  console.log('   Please create a .env file first');
  process.exit(1);
}

// Read current .env file
let envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');

// Check current BASE_URL
const baseUrlLine = lines.find(line => line.trim().startsWith('BASE_URL='));
if (baseUrlLine) {
  const currentUrl = baseUrlLine.split('=')[1]?.trim();
  console.log(`\n📋 Current BASE_URL: ${currentUrl || '(not set)'}`);
  
  if (currentUrl && currentUrl.includes(networkIP)) {
    console.log('✅ BASE_URL is already correctly configured!');
    console.log('\n💡 No changes needed. Your downloads should work across devices.');
    process.exit(0);
  }
}

// Ask user if they want to update
console.log('\n❓ Would you like to update BASE_URL in .env?');
console.log('   This will allow downloads to work from other devices.\n');

// For automated update, uncomment the following:
/*
const newBaseUrl = `http://${networkIP}:${PORT}`;
const updatedLines = lines.map(line => {
  if (line.trim().startsWith('BASE_URL=')) {
    return `BASE_URL=${newBaseUrl}`;
  }
  return line;
});

// If BASE_URL doesn't exist, add it
if (!baseUrlLine) {
  updatedLines.push(`BASE_URL=${newBaseUrl}`);
}

fs.writeFileSync(envPath, updatedLines.join('\n'));
console.log(`✅ Updated .env file with BASE_URL=${newBaseUrl}`);
console.log('\n🔄 Please restart your server for changes to take effect');
*/

console.log('📝 Manual Update Instructions:');
console.log('   1. Open your .env file');
console.log('   2. Find or add the line: BASE_URL=...');
console.log(`   3. Change it to: BASE_URL=http://${networkIP}:${PORT}`);
console.log('   4. Save the file');
console.log('   5. Restart your server\n');

console.log('🔥 Quick copy-paste:');
console.log(`   BASE_URL=http://${networkIP}:${PORT}\n`);
