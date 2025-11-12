const { getDb } = require('../../_db.js');
const { getUserFromReq } = require('../../_auth.js');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = getUserFromReq(req);
    if (!user) {
      console.log('No user found in request for order retrieval');
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { sessionId } = req.params;
    const db = await getDb();
    const order = await db.collection("orders").findOne({ stripeSessionId: sessionId, userId: user.id });
    if (!order) {
      console.log('Order not found for sessionId:', sessionId);
      return res.status(404).json({ error: "Order not found" });
    }
    return res.json(order);
  } catch (err) {
    console.error("Get order error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};