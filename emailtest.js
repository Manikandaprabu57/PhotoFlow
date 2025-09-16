const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.sendMail({
  from: process.env.EMAIL_USER,
  to: process.env.EMAIL_USER, // send to yourself
  subject: "OTP Test",
  text: "Hello! This is a test email from nodemailer."
})
.then(() => console.log("✅ Email sent"))
.catch((err) => console.error("❌ Failed to send email:", err));
