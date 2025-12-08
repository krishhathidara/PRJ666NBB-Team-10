const { getDb } = require('./_db.js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('POST /api/checkout received');
    
    const cookie = req.headers.cookie || "";
    const token = cookie
      .split(";")
      .find((c) =>
        c.trim().startsWith((process.env.AUTH_COOKIE || "app_session") + "=")
      );
    if (!token) {
      console.log('No token found in request');
      return res.status(401).json({ error: "Unauthorized" });
    }

    const decoded = jwt.verify(
      token.split("=")[1],
      process.env.JWT_SECRET || "dev-secret"
    );
    const email = decoded.email;
    if (!email) {
      console.log('No email in token');
      return res.status(401).json({ error: "Unauthorized" });
    }
    const id = decoded.id;
    if (!email) {
      console.log('No id in token');
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    console.log('User authenticated:', email, 'ID:', id);
    
    const db = await getDb();
    const cart = db.collection("cart"); 
    
    // Get all cart items for this user
    const cartItems = await cart.find({ userEmail: email }).toArray();
    
    console.log('Cart items found:', cartItems);
    
    if (!cartItems || cartItems.length === 0) {
      console.log('Cart is empty for user:', email);
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Calculate totals
    const subtotal = cartItems.reduce((sum, item) => 
      sum + (item.price || 0) * (item.quantity || 1), 0
    );
    const tax = subtotal * 0.13; // 13% HST
    const total = subtotal + tax;

    //check which APP_URL is current on and use that for redirecting after payment
    const APP_URL = process.env.APP_URL || "http://localhost:3000";

    console.log('Using APP_URL:', APP_URL);

    // Create Stripe session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: cartItems.map(item => ({
        price_data: {
          currency: 'cad',
          product_data: { name: `${item.name} (${item.store || 'Store'})` },
          unit_amount: Math.round((item.price || 0) * 100) // Cents
        },
        quantity: item.quantity || 1
      })),
      mode: 'payment',
      success_url: `${process.env.APP_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/cart.html` ,
      metadata: {
        userId: id,
        userEmail: email  //store email in metadata for webhook
      }
    });
    
    console.log('Stripe session created:', session.id);

    // Save order to MongoDB
    await db.collection("orders").insertOne({
      userId: id,
      userEmail: email, // Use email to match your cart structure
      items: cartItems, // Store the cart items array
      total: total,
      paymentMethod: 'credit_card',
      paymentStatus: 'pending',
      stripeSessionId: session.id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('Order saved with sessionId:', session.id, 'userId:', id, 'userEmail:', email);

    // Clear cart - delete all items for this user
    // await cart.deleteMany({ userEmail: email });
    // console.log('Cart cleared for user:', email);

    return res.json({ sessionId: session.id });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
};