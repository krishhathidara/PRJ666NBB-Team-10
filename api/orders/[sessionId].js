// api/orders/[sessionId].js
// Dynamic route wrapper for Vercel: /api/orders/:sessionId
// Reuses the existing logic from sessionId.js (which also works for local Express).

const handler = require("./sessionId.js");

module.exports = async (req, res) => {
  return handler(req, res);
};
