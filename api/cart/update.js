// /api/cart/update.js
const { getDb } = require("../_db");
const { getUserFromReq } = require("../_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "PATCH")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = getUserFromReq(req);
    if (!user || !user.email) return res.status(401).json({ error: "Unauthorized" });

    const db = await getDb();
    const cart = db.collection("cart");

    const { productId, quantity } = req.body || {};
    if (!productId || !quantity)
      return res.status(400).json({ error: "Missing fields" });

    await cart.updateOne(
      { userEmail: user.email, productId },
      { $set: { quantity } }
    );

    const items = await cart.find({ userEmail: user.email }).toArray();
    res.status(200).json(items);
  } catch (err) {
    console.error("PATCH /api/cart/update error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
};
