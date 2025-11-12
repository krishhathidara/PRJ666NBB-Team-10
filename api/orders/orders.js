const { getDb } = require('../../_db.js');
const { getUserFromReq } = require('../../_auth.js');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = getUserFromReq(req);
    if (!user) {
      console.log('No user found in request for orders');
      return res.status(401).json({ error: "Unauthorized" });
    }
    console.log('Fetching orders for user:', user.id);
    const db = await getDb();
    const orders = await db.collection("orders")
      .find({ userId: user.id })
      .sort({ createdAt: -1 })
      .toArray();
    console.log('Orders found:', orders.length);
    return res.json(orders);
  } catch (err) {
    console.error("Get orders error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};