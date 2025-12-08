// /api/cart/index.js
const getHandler = require('./get');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return getHandler(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
};
