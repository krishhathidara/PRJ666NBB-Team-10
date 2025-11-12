// /api/cart/get.js
const { getDb } = require("../_db");
const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    // --- extract user from cookie ---
    const cookie = req.headers.cookie || "";
    const token = cookie
      .split(";")
      .find((c) =>
        c.trim().startsWith((process.env.AUTH_COOKIE || "app_session") + "=")
      );
    if (!token)
      return res.status(401).json({ error: "Unauthorized: No token" });

    const decoded = jwt.verify(
      token.split("=")[1],
      process.env.JWT_SECRET || "dev-secret"
    );
    const email = decoded.email;
    if (!email)
      return res.status(401).json({ error: "Unauthorized: No email" });

    // --- connect to MongoDB ---
    const db = await getDb();
    const cart = db.collection("cart");

    // --- fetch user cart items ---
    const items = await cart.find({ userEmail: email }).toArray();

    // --- calculate totals ---
    const subtotal = items.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
      0
    );
    const tax = subtotal * 0.13;
    const total = subtotal + tax;

    res.status(200).json({ items, subtotal, tax, total });
  } catch (err) {
    console.error("GET /api/cart error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
};
