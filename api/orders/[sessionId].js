// /api/orders/[sessionId].js
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

function sendJson(res, statusCode, payload) {
  if (typeof res.status === "function") {
    return res.status(statusCode).json(payload);
  }
  res.statusCode = statusCode;
  if (res.setHeader) res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  try {
    const method = req.method || "GET";
    if (method !== "GET") {
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    const q = req.query || {};
    const sessionId =
      q.sessionId || q.session_id || q.id || (q && q[0]) || null;

    // If running as a Vercel dynamic route, sessionId will be in req.query.sessionId
    if (!sessionId) {
      return sendJson(res, 400, { ok: false, error: "Missing sessionId" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });

    const lineItems = (session.line_items && session.line_items.data) || [];
    const items = lineItems.map((li) => ({
      name: li.description,
      quantity: li.quantity,
      unitAmount: li.price && li.price.unit_amount
        ? li.price.unit_amount / 100
        : null,
      totalAmount: li.amount_total ? li.amount_total / 100 : null,
    }));

    const amount =
      (session.amount_total ? session.amount_total / 100 : null) ||
      items.reduce((acc, it) => acc + (it.totalAmount || 0), 0);

    const payload = {
      ok: true,
      sessionId,
      amount,
      currency: (session.currency || "cad").toUpperCase(),
      storeName:
        (session.metadata && (session.metadata.storeName || session.metadata.store)) ||
        "Online Order",
      customerEmail:
        (session.customer_details && session.customer_details.email) ||
        session.customer_email ||
        null,
      items,
    };

    return sendJson(res, 200, payload);
  } catch (err) {
    console.error("Stripe [sessionId] error:", err);
    return sendJson(res, 500, {
      ok: false,
      error: "Failed to load checkout session",
    });
  }
};
