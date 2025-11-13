// api/_auth.js (CommonJS)
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail fast in serverless so we see this in logs
  throw new Error('JWT_SECRET not set');
}

const COOKIE_NAME = process.env.AUTH_COOKIE || 'token';
const MAX_AGE = Number(process.env.AUTH_MAXAGE || 60 * 60 * 24 * 7); // 7 days (seconds)

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: MAX_AGE });
}

function setAuthCookie(res, token) {
  const isProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE
  }));
}

function clearAuthCookie(res) {
  const isProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  }));
}

function getUserFromReq(req) {
  try {
    const cookies = cookie.parse(req.headers.cookie || '');
    const tok = cookies[COOKIE_NAME];
    if (!tok) return null;
    return jwt.verify(tok, JWT_SECRET);
  } catch (_) {
    return null;
  }
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, getUserFromReq, COOKIE_NAME };
