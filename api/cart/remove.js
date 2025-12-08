// /api/cart/remove.js
const { getDb } = require("../_db");
const { getUserFromReq } = require("../_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = getUserFromReq(req);
    if (!user || !user.email) return res.status(401).json({ error: "Unauthorized" });

    const db = await getDb();
    const cart = db.collection("cart");

    const { productId } = req.body || {};
    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    await cart.deleteOne({ userEmail: user.email, productId });

    const items = await cart.find({ userEmail: user.email }).toArray();
    res.status(200).json(items);
  } catch (err) {
    console.error("DELETE /api/cart/remove error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
};
