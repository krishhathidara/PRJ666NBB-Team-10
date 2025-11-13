// api/auth/logout.js (CommonJS)
const { clearAuthCookie } = require('../_auth.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  clearAuthCookie(res);

  const wantsHTML = (req.headers.accept || '').includes('text/html');
  if (wantsHTML) {
    res.writeHead(303, { Location: '/auth/signin.html' });
    return res.end();
  }
  return res.status(200).json({ ok: true });
};
