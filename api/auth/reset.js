// Import required modules
const { getDb } = require('../_db.js');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Main handler for POST /api/auth/reset
module.exports = async (req, res) => {
  // Restrict to POST requests
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Process reset request
  try {
    const { email } = normalizeBody(req.body);
    if (!email) return respond(req, res, 400, { error: 'Email required' }, '/auth/signin.html?error=missing');

    // Check if user exists
    const db = await getDb();
    const users = db.collection('users');
    const user = await users.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      // Return generic response to prevent email enumeration
      return respond(req, res, 400, { error: 'No user found with provided email.' }, '/auth/signin.html?error=no-user');
    }

    // Generate and store reset token
    const token = crypto.randomBytes(16).toString('hex'); // 32-char hex token, cryptographically secure
    const hashedToken = await bcrypt.hash(token, 10);
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration
    await users.updateOne({ _id: user._id }, { $set: { resetToken: hashedToken, resetExpires: expires } });

    // Send reset email
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false, // Use false for port 587, true for 465
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    const resetUrl = `${process.env.APP_URL}/auth/reset.html?token=${token}&email=${encodeURIComponent(email)}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset Request',
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`
    });

    // Respond with success
    return respond(req, res, 200, { message: 'reset email has been sent.' }, '/auth/signin.html?reset=sent');
  } catch (err) {
    console.error('reset error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Normalize request body (handles JSON or form data)
function normalizeBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return Object.fromEntries(new URLSearchParams(body)); } catch { return {}; }
  }
  if (typeof body === 'object') return body;
  return {};
}

// Respond with JSON or redirect based on request type
function respond(req, res, status, json, location) {
  const wantsHTML = (req.headers.accept || '').includes('text/html') || (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
  if (wantsHTML) {
    res.writeHead(303, { Location: location });
    return res.end();
  }
  return res.status(status).json(json);
}