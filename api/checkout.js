const { getDb } = require("./_db.js");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cookie = req.headers.cookie || "";
    const token = cookie
      .split(";")
      .find((c) =>
        c.trim().startsWith((process.env.AUTH_COOKIE || "app_session") + "=")
      );

    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const decoded = jwt.verify(
      token.split("=")[1],
      process.env.JWT_SECRET || "dev-secret"
    );

    const email = decoded.email;
    const userId = decoded.id;
    if (!email || !userId)
      return res.status(401).json({ error: "Unauthorized" });

    const db = await getDb();
    const cart = db.collection("cart");

    // Get user's cart
    const cartItems = await cart.find({ userEmail: email }).toArray();
    if (!cartItems.length)
      return res.status(400).json({ error: "Cart is empty" });

    // ENSURE EACH CART ITEM HAS A STORE NAME
    const cleanedItems = cartItems.map((item) => ({
      ...item,
      storeName:
        item.storeName ||
        item.store ||
        item.vendor ||
        item.storeId ||
        "Unknown Store",
    }));

    // SUBTOTAL
    const subtotal = cleanedItems.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
      0
    );
    const tax = subtotal * 0.13;
    const total = subtotal + tax;

    const APP_URL = process.env.APP_URL || "http://localhost:3000";

    // Stripe checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: cleanedItems.map((item) => ({
        price_data: {
          currency: "cad",
          product_data: {
            name: `${item.name} (${item.storeName})`,
          },
          unit_amount: Math.round((item.price || 0) * 100),
        },
        quantity: item.quantity || 1,
      })),
      mode: "payment",
      success_url: `${APP_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/cart.html`,
      metadata: {
        userId,
        userEmail: email,
      },
    });

    // SAVE ORDER — IMPORTANT PART
    await db.collection("orders").insertOne({
      userId,
      userEmail: email,
      items: cleanedItems,
      storeName: cleanedItems[0].storeName, // MAIN FIX ⭐⭐⭐
      total,
      paymentMethod: "credit_card",
      paymentStatus: "pending",
      stripeSessionId: session.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return res.json({ sessionId: session.id });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
};
