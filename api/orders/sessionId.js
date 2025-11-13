// api/orders/sessionId.js
const { getDb } = require("../_db.js");
const { getUserFromReq } = require("../_auth.js");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_SECRET_KEY ? require("stripe")(STRIPE_SECRET_KEY) : null;

module.exports = async (req, res) => {
  // Only allow GET
  if (req.method && req.method !== "GET") {
    if (res.setHeader) res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const sessionId = getSessionIdFromRequest(req);

    if (!sessionId) {
      console.log("Missing sessionId in /api/orders/sessionId", {
        query: req.query,
        url: req.url,
      });
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const db = await getDb();
    const orders = db.collection("orders");
    const user = getUserFromReq(req);

    let order = null;

    // 1) Try existing order docs first
    if (user && user.id) {
      order = await orders.findOne({
        stripeSessionId: sessionId,
        userId: user.id,
      });
    }

    if (!order) {
      order = await orders.findOne({ stripeSessionId: sessionId });
    }

    // 2) If not found in DB, try to build it from Stripe checkout session
    if (!order) {
      if (!stripe) {
        console.error(
          "No STRIPE_SECRET_KEY configured; cannot fetch session from Stripe"
        );
        return res.status(404).json({ error: "Order not found" });
      }

      let stripeSession;
      try {
        stripeSession = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["line_items.data.price.product"],
        });
      } catch (e) {
        console.error("Stripe session retrieve failed:", e.message);
        return res.status(404).json({ error: "Order not found" });
      }

      if (!stripeSession) {
        console.log("Stripe session not found:", sessionId);
        return res.status(404).json({ error: "Order not found" });
      }

      const lineItems =
        stripeSession.line_items && stripeSession.line_items.data
          ? stripeSession.line_items.data
          : [];

      const items = lineItems.map((li) => {
        const qty = li.quantity || 1;
        const unitAmount =
          (li.price && li.price.unit_amount) || li.amount_total || 0;
        const unitPrice = unitAmount / 100;

        return {
          name:
            li.description ||
            (li.price &&
              li.price.product &&
              li.price.product.name) ||
            "Item",
          quantity: qty,
          price: unitPrice,
          store: (li.metadata && li.metadata.store) || "Grocery Web",
          storeLocation:
            (li.metadata && li.metadata.storeLocation) || "Pickup at store",
          deliveryMethod:
            (li.metadata && li.metadata.deliveryMethod) || "Pickup at store",
        };
      });

      const createdAt = new Date((stripeSession.created || Date.now() / 1000) * 1000);
      const total =
        typeof stripeSession.amount_total === "number"
          ? stripeSession.amount_total / 100
          : items.reduce(
              (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
              0
            );

      order = {
        stripeSessionId: stripeSession.id || sessionId,
        userId: user ? user.id : null,
        userEmail:
          (stripeSession.customer_details &&
            stripeSession.customer_details.email) ||
          (user && user.email) ||
          "",
        paymentStatus: stripeSession.payment_status || "paid",
        paymentMethod:
          (stripeSession.payment_method_types &&
            stripeSession.payment_method_types[0]) ||
          "card",
        deliveryMethod: "Pickup at store",
        createdAt,
        items,
        total,
        createdFromStripe: true,
      };

      // Save it so next time we hit DB directly
      try {
        const insertResult = await orders.insertOne(order);
        order._id = insertResult.insertedId.toString();
      } catch (e) {
        console.error("Failed to insert Stripe-derived order:", e);
      }
    }

    if (order._id) {
      order._id = String(order._id);
    }

    return res.status(200).json(order);
  } catch (err) {
    console.error("Get order error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
};

// ---- helpers ----
function getSessionIdFromRequest(req) {
  try {
    const q = req.query || {};

    // From query string: ?sessionId=... or ?session_id=... or ?id=...
    if (q.sessionId || q.session_id || q.id) {
      return q.sessionId || q.session_id || q.id;
    }

    // From Express params: /api/orders/:sessionId
    if (req.params && (req.params.sessionId || req.params.id)) {
      return req.params.sessionId || req.params.id;
    }

    // Fallback: from raw URL path
    const url = req.url || "";
    const clean = url.split("?")[0]; // /api/orders/sessionId or /api/orders/cs_...
    const parts = clean.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "");
  } catch {
    return null;
  }
}
