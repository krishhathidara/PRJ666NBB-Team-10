// Import required modules
const { getDb } = require('../_db.js');
const bcrypt = require('bcryptjs');
const { setAuthCookie, signToken } = require('../_auth.js');

// Main handler for POST /api/auth/reset-confirm
module.exports = async (req, res) => {
  // Restrict to POST requests
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Process reset confirmation
  try {
    const { token, email, password } = normalizeBody(req.body);
    if (!token || !email || !password) return respond(req, res, 400, { error: 'All fields required' }, '/auth/reset.html?error=missing');

    // Verify user and token
    const db = await getDb();
    const users = db.collection('users');
    const user = await users.findOne({ email: email.trim().toLowerCase() });
    if (!user || !user.resetToken || !user.resetExpires || new Date() > user.resetExpires) {
      return respond(req, res, 401, { error: 'Invalid or expired token' }, '/auth/reset.html?error=invalid');
    }

    // Validate token
    const isValid = await bcrypt.compare(token, user.resetToken);
    if (!isValid) return respond(req, res, 401, { error: 'Invalid or expired token' }, '/auth/reset.html?error=invalid');

    // Update password and clear reset token
    const hashedPassword = await bcrypt.hash(password, 10);
    await users.updateOne({ _id: user._id }, {
      $set: { password: hashedPassword, updatedAt: new Date() },
      $unset: { resetToken: '', resetExpires: '' }
    });

    // Sign in user automatically
    const newToken = signToken({ id: String(user._id), email: user.email, name: user.name });
    setAuthCookie(res, newToken);

    // Respond with success
    return respond(req, res, 200, { message: 'Password reset successful' }, '/profile.html');
  } catch (err) {
    console.error('reset-confirm error:', err);
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