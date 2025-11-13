// /api/cart/add.js
const { getDb } = require("../_db");
const { getUserFromReq } = require("../_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = getUserFromReq(req);
    if (!user || !user.email) return res.status(401).json({ error: "Unauthorized" });

    const db = await getDb();
    const cart = db.collection("cart");

    const { productId, name, price, store, quantity = 1 } = req.body || {};
    if (!name || price == null)
      return res.status(400).json({ error: "Missing name or price" });

    await cart.updateOne(
      { userEmail: user.email, productId },
      { $set: { userEmail: user.email, productId, name, store, price, quantity } },
      { upsert: true }
    );

    const items = await cart.find({ userEmail: user.email }).toArray();
    res.status(200).json(items);
  } catch (err) {
    console.error("POST /api/cart/add error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
};
