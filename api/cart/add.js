// api/cart/add.js
// Robust cookie parsing + JWT verify + upsert to Mongo

const jwt = require("jsonwebtoken");
const { getDb } = require("../_db");

// tiny cookie parser (no external deps)
function parseCookie(header = "") {
  return header
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean)
    .reduce((acc, kv) => {
      const i = kv.indexOf("=");
      if (i === -1) return acc;
      const k = decodeURIComponent(kv.slice(0, i));
      const v = decodeURIComponent(kv.slice(i + 1));
      acc[k] = v;
      return acc;
    }, {});
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cookieName = process.env.AUTH_COOKIE || "app_session";
    const cookies = parseCookie(req.headers.cookie || "");
    const token =
      cookies[cookieName] ||
      cookies.app_session ||
      cookies.session ||
      cookies.token;

    if (!token) return res.status(401).json({ error: "Unauthorized" });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }

    const email = decoded?.email || decoded?.sub;
    if (!email) return res.status(401).json({ error: "Unauthorized" });

    const { productId, name, price, store, quantity } = req.body || {};
    if (!name || price == null) {
      return res.status(400).json({ error: "Missing name or price" });
    }

    const pid = productId ?? name;
    const qty = Math.max(1, parseInt(quantity ?? 1, 10) || 1);
    const numericPrice = Number(price);

    const db = await getDb();
    const cart = db.collection("cart");

    await cart.updateOne(
      { userEmail: email, productId: pid },
      {
        $set: {
          userEmail: email,
          productId: pid,
          name,
          store: store || null,
          price: numericPrice,
          quantity: qty,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    const items = await cart.find({ userEmail: email }).toArray();
    return res.status(200).json({ items });
  } catch (err) {
    console.error("POST /api/cart/add error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
};
