// /api/cart/get.js
const { getDb } = require("../_db");
const { getUserFromReq } = require("../_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = getUserFromReq(req);
    if (!user || !user.email)
      return res.status(401).json({ error: "Unauthorized" });

    const db = await getDb();
    const cart = db.collection("cart");

    const items = await cart.find({ userEmail: user.email }).toArray();
    const subtotal = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (it.quantity || 1), 0);
    const tax = subtotal * 0.13;
    const total = subtotal + tax;

    res.status(200).json({ items, subtotal, tax, total });
  } catch (err) {
    console.error("GET /api/cart error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
};
