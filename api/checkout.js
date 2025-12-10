const { getDb } = require('./_db.js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = async (req, res) => {
  // 1. Method Check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('POST /api/checkout received');
    
    // 2. Auth Check
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
    
    const { email, id } = decoded;
    if (!email || !id) return res.status(401).json({ error: "Unauthorized" });
    
    console.log('User authenticated:', email, 'ID:', id);
    
    // 3. Database Connection
    const db = await getDb();
    const cart = db.collection("cart"); 
    
    const cartItems = await cart.find({ userEmail: email }).toArray();
    
    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // 4. Clean Items & Calculate Totals
    // Ensure every item has a store, price, and quantity for accurate splitting later
    const cleanItems = cartItems.map(item => ({
        ...item,
        store: item.store || "General Store", // Fallback
        price: parseFloat(item.price || 0),
        quantity: parseInt(item.quantity || 1)
    }));

    const subtotal = cleanItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.13; 
    const total = parseFloat((subtotal + tax).toFixed(2));

    // Determine Primary Store Name (for top-level order label)
    const primaryStore = cleanItems[0].store;

    // 5. Determine Redirect URL
    const origin = req.headers.origin || process.env.APP_URL || "http://localhost:3000";

    // 6. Create Stripe Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: cleanItems.map(item => ({
        price_data: {
          currency: 'cad',
          product_data: { 
            name: `${item.name} (${item.store})`,
            metadata: { productId: item.productId }
          },
          unit_amount: Math.round(item.price * 100)
        },
        quantity: item.quantity
      })),
      mode: 'payment',
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart.html`,
      customer_email: email, 
      metadata: { userId: id, userEmail: email }
    });
    
    // 7. Save Pending Order to Database
    // Saving 'cleanItems' guarantees api/users.js can split the cost by store later
    await db.collection("orders").insertOne({
      userId: id,
      userEmail: email, 
      items: cleanItems, 
      total: total, 
      amount_total: Math.round(total * 100), 
      storeName: primaryStore, 
      paymentMethod: 'credit_card',
      paymentStatus: 'pending', 
      stripeSessionId: session.id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('Order saved:', session.id);

    return res.json({ sessionId: session.id });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
};