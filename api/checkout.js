const { getDb } = require('../_db.js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getUserFromReq } = require('../_auth.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('POST /api/checkout received');
    const user = getUserFromReq(req);
    if (!user) {
      console.log('No user found in request');
      return res.status(401).json({ error: "Unauthorized" });
    }
    console.log('User authenticated:', user.id);
    const db = await getDb();
    const carts = db.collection("carts");
    const cart = await carts.findOne({ userId: user.id });
    if (!cart || !cart.items.length) {
      console.log('Cart is empty for user:', user.id);
      return res.status(400).json({ error: "Cart is empty" });
    }

    const subtotal = cart.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const tax = subtotal * 0.13; // 13% HST
    const total = subtotal + tax;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: cart.items.map(item => ({
        price_data: {
          currency: 'cad',
          product_data: { name: `${item.name} (${item.store})` },
          unit_amount: Math.round(item.price * 100) // Cents
        },
        quantity: item.quantity
      })),
      mode: 'payment',
      success_url: `${process.env.APP_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/cart.html`
    });
    console.log('Stripe session created:', session.id);

    // Save order to MongoDB
    await db.collection("orders").insertOne({
      userId: user.id,
      items: cart.items,
      total: total,
      paymentMethod: 'credit_card',
      paymentStatus: 'pending', // Will be updated by webhook in production
      stripeSessionId: session.id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Order saved with sessionId:', session.id);

    // Clear cart
    await carts.deleteOne({ userId: user.id });
    console.log('Cart cleared for user:', user.id);

    return res.json({ sessionId: session.id });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};