const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('🔍 Testing Email Configuration...');
console.log(`Email User: ${process.env.EMAIL_USER}`);
console.log(`Email Pass: ${process.env.EMAIL_PASS ? '***configured***' : 'NOT SET'}`);

const transporter = nodemailer.createTransporter({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  debug: true,
  logger: true
});

async function testEmail() {
  try {
    console.log('\n📧 Testing SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection successful!');
    
    console.log('\n📤 Sending test email...');
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Send to self for testing
      subject: "Test Email - PhotoFlow Pro",
      html: `
        <h2>Email Test Successful!</h2>
        <p>This is a test email from PhotoFlow Pro.</p>
        <p>Time: ${new Date().toLocaleString()}</p>
      `
    });
    
    console.log('✅ Test email sent successfully!');
    console.log('Message ID:', info.messageId);
    
  } catch (error) {
    console.error('❌ Email test failed:', error);
    
    if (error.code === 'EAUTH') {
      console.error('\n🔧 Authentication Error Solutions:');
      console.error('1. Check if EMAIL_PASS is the correct 16-character App Password');
      console.error('2. Ensure 2-Factor Authentication is enabled on Gmail');
      console.error('3. Generate a new App Password: https://myaccount.google.com/apppasswords');
      console.error('4. Make sure "Less secure app access" is NOT enabled (use App Password instead)');
    } else if (error.code === 'ENOTFOUND') {
      console.error('\n🔧 Network Error Solutions:');
      console.error('1. Check internet connection');
      console.error('2. Check if firewall is blocking SMTP');
    }
  }
}

testEmail();
