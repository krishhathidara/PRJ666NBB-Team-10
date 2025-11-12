// /api/cart/remove.js
const { getDb } = require("../_db");
const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const cookie = req.headers.cookie || "";
    const token = cookie
      .split(";")
      .find((c) =>
        c.trim().startsWith((process.env.AUTH_COOKIE || "app_session") + "=")
      );
    if (!token)
      return res.status(401).json({ error: "Unauthorized" });

    const decoded = jwt.verify(
      token.split("=")[1],
      process.env.JWT_SECRET || "dev-secret"
    );
    const email = decoded.email;

    const db = await getDb();
    const cart = db.collection("cart");

    const { productId } = req.body || {};
    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    await cart.deleteOne({ userEmail: email, productId });

    const items = await cart.find({ userEmail: email }).toArray();
    res.status(200).json(items);
  } catch (err) {
    console.error("DELETE /api/cart/remove error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
};
