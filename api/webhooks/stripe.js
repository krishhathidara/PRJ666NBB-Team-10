//const { getDb } = require('../_db.js');
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// module.exports = async (req, res) => {
//   if (req.method !== 'POST') {
//     return res.status(405).json({ error: 'Method not allowed' });
//   }

//   const sig = req.headers['stripe-signature'];
//   const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

//   if (!webhookSecret) {
//     console.error('STRIPE_WEBHOOK_SECRET not set in environment');
//     return res.status(500).json({ error: 'Webhook secret not configured' });
//   }

//   let event;

//   try {
//     // Verify webhook signature
//     event = stripe.webhooks.constructEvent(
//       req.rawBody,
//       sig,
//       webhookSecret
//     );
//   } catch (err) {
//     console.error('Webhook signature verification failed:', err.message);
//     return res.status(400).send(`Webhook Error: ${err.message}`);
//   }

//   consle.log('Event type:', event.type);

//   // Handle the event
//   if (event.type === 'checkout.session.completed') {
//     const session = event.data.object;
    
//     console.log('✅ Payment successful for session:', session.id);
    
//     try {
//       const db = await getDb();
//       const userEmail = session.metadata.userEmail;

//       // Update order status to "paid"
//       const updateResult = await db.collection("orders").updateOne(
//         { stripeSessionId: session.id },
//         { 
//           $set: { 
//             paymentStatus: 'paid',
//             paidAt: new Date()
//           } 
//         }
//       );
      
//       if(updateResult.matchedCount > 0) {
//         console.log('Order marked as paid');
//       } else {
//         console.warn('No matching order found for session ID:', session.id);
//       }

//       if(userEmail) {
//         // clear the cart after successful payment
//         await db.collection("cart").deleteMany({ userEmail });
//         console.log('Cart cleared for user:', userEmail);
//       }
      
//     } catch (err) {
//       console.error('Error processing webhook:', err);
//       return res.status(500).json({ error: 'Webhook processing failed' });
//     }
//   }

//   res.json({ received: true });
// };
const { MongoClient } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Helper to get raw body as string (for serverless environments)
async function getRawBody(req) {
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
    // Use rawBody if available (from server.local.js), otherwise get it
    const rawBody = req.rawBody || (await getRawBody(req));
    console.log('📦 Raw body received, length:', rawBody.length);

    // Verify webhook signature
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

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    console.log('💳 Payment completed!');
    console.log('   Session ID:', session.id);
    console.log('   Metadata:', session.metadata);
    
    try {
      // Connect to MongoDB
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      const db = client.db();
      
      const userEmail = session.metadata.userEmail;

      // Update order status to "paid"
      const updateResult = await db.collection("orders").updateOne(
        { stripeSessionId: session.id },
        { 
          $set: { 
            paymentStatus: 'paid',
            paidAt: new Date()
          } 
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        console.log('✅ Order marked as paid');
      } else {
        console.warn('⚠️ Order not found for session:', session.id);
      }

      // Clear cart
      if (userEmail) {
        const deleteResult = await db.collection("cart").deleteMany({ userEmail });
        console.log(`✅ Cart cleared: ${deleteResult.deletedCount} items`);
      } else {
        console.warn('⚠️ No userEmail in metadata');
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

// Export for both CommonJS (local) and ES modules (Vercel)
module.exports = handler;
module.exports.default = handler;

// Vercel serverless function config (ignored in local environment)
module.exports.config = {
  api: {
    bodyParser: false,
  },
};