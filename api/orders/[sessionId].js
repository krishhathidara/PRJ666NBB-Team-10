// api/orders/[sessionId].js
const { getDb } = require('../_db.js');
const { getUserFromReq } = require('../_auth.js');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = getUserFromReq(req);
    if (!user) {
      console.log('No user found in request for order retrieval');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Try *every* place a session id might live
    const sessionId =
      (req.query &&
        (req.query.sessionId || req.query.session_id || req.query.id)) ||
      (req.params &&
        (req.params.sessionId || req.params.session_id || req.params.id)) ||
      extractSessionIdFromUrl(req.url);

    if (!sessionId) {
      console.log('Missing sessionId in /api/orders/[sessionId]', {
        query: req.query,
        params: req.params,
        url: req.url,
      });
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const db = await getDb();
    const orders = db.collection('orders');

    const order = await orders.findOne({
      stripeSessionId: sessionId,
      userId: user.id,
    });

    if (!order) {
      console.log('Order not found', { sessionId, userId: user.id });
      return res.status(404).json({ error: 'Order not found' });
    }

    // Convert _id to string so JSON is clean
    if (order._id) {
      order._id = String(order._id);
    }

    return res.status(200).json(order);
  } catch (err) {
    console.error('Get order error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

// Fallback: pull the id from the raw URL path
function extractSessionIdFromUrl(url = '') {
  try {
    const clean = url.split('?')[0];        // /api/orders/cs_test_123
    const parts = clean.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || '');
  } catch {
    return null;
  }
}
