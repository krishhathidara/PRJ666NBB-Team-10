// api/orders/sessionId.js
const { getDb } = require("../_db.js");
const { getUserFromReq } = require("../_auth.js");

module.exports = async (req, res) => {
  // Only allow GET
  if (req.method && req.method !== "GET") {
    if (res.setHeader) res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const sessionId = getSessionIdFromRequest(req);

    if (!sessionId) {
      console.log("Missing sessionId in /api/orders/sessionId", {
        query: req.query,
        url: req.url,
      });
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const db = await getDb();
    const orders = db.collection("orders");

    const user = getUserFromReq(req);

    let order = null;

    // If we know the user, try strict match first
    if (user && user.id) {
      order = await orders.findOne({
        stripeSessionId: sessionId,
        userId: user.id,
      });
    }

    // Fallback: match just by Stripe session id
    if (!order) {
      order = await orders.findOne({ stripeSessionId: sessionId });
    }

    if (!order) {
      console.log("Order not found", {
        sessionId,
        userId: user ? user.id : null,
      });
      return res.status(404).json({ error: "Order not found" });
    }

    if (order._id) {
      order._id = String(order._id);
    }

    return res.status(200).json(order);
  } catch (err) {
    console.error("Get order error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
};

function getSessionIdFromRequest(req) {
  try {
    const q = req.query || {};

    // From query string: ?sessionId=... or ?session_id=... or ?id=...
    if (q.sessionId || q.session_id || q.id) {
      return q.sessionId || q.session_id || q.id;
    }

    // Fallback: from raw URL path (works both on Vercel & Express):
    // /api/orders/sessionId?sessionId=...
    const url = req.url || "";
    const clean = url.split("?")[0];
    const parts = clean.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "");
  } catch {
    return null;
  }
}
