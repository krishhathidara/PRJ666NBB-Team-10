// api/auth/me.js (CommonJS)
const { getUserFromReq } = require('../_auth.js');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  return res.status(200).json({ id: user.id, email: user.email, name: user.name });
};
