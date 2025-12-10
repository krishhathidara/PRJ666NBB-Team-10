const { MongoClient } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Helper to get raw body as string
async function getRawBody(req) {
  if (req.rawBody) return req.rawBody;
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('🎯 WEBHOOK ENDPOINT HIT');

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('❌ STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    console.log('📦 Raw body received, length:', rawBody.length);

    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      webhookSecret
    );
    console.log('✅ Signature verified');
  } catch (err) {
    console.error('❌ Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('📨 Event type:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    console.log('💳 Payment completed!');
    console.log('   Session ID:', session.id);
    console.log('   Metadata:', session.metadata);
    
    try {
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      const db = client.db();
      
      const userEmail = session.metadata.userEmail;

      // 1. Update order status to "paid"
      const updateResult = await db.collection("orders").updateOne(
        { stripeSessionId: session.id },
        { 
          $set: { 
            paymentStatus: 'paid',
            paidAt: new Date(),
            receiptUrl: session.receipt_url 
          } 
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        console.log('✅ Order marked as paid');
      } else {
        console.warn('⚠️ Order not found for session:', session.id);
      }

      // 2. Clear cart
      if (userEmail) {
        const deleteResult = await db.collection("cart").deleteMany({ userEmail });
        console.log(`✅ Cart cleared for ${userEmail}: ${deleteResult.deletedCount} items removed`);
      } else {
        console.warn('⚠️ No userEmail in metadata, cart not cleared');
      }
      
      await client.close();
    } catch (err) {
      console.error('❌ Processing error:', err);
      return res.status(500).json({ error: 'Processing failed' });
    }
  }

  console.log('✅ Webhook processed successfully\n');
  res.status(200).json({ received: true });
}

module.exports = handler;
module.exports.default = handler;

module.exports.config = {
  api: {
    bodyParser: false,
  },
};