// api/orders/sessionId.js
// Look up a Stripe Checkout session by sessionId,
// normalize it into an "order" document and upsert into MongoDB.

/* eslint-disable no-console */
const { getDb } = require("../_db.js");
const { getUserFromReq } = require("../_auth.js");

// ---------------- STRIPE SECRET KEY ----------------
// Fallback to your test key so it works on Vercel even if env is missing.
const STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_SECRET ||
  "sk_test_51SIyaMRt1KViteu9SbINBmMjVuCw4YhvRZ52bIlIYmE7xQPZzvdXzjm4paMQXea5ytryTWxcOtVaaYFsVpQsr5Fm00TqxQPQsY";

if (!STRIPE_SECRET_KEY) {
  console.warn(
    "[orders/sessionId] STRIPE_SECRET_KEY is missing. " +
      "New orders cannot be built from Stripe; only existing DB orders will be returned."
  );
}

// Use global fetch if available, otherwise node-fetch (for older runtimes)
let doFetch = global.fetch;
if (!doFetch) {
  doFetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));
}

// ---------------- SMALL HELPERS ----------------
function safeNumber(v) {
  if (typeof v === "number") return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeEmail(email) {
  if (!email) return "";
  return String(email).trim().toLowerCase();
}

// ---------------- MAIN HANDLER ----------------
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

    console.log("[orders/sessionId] Looking up order for session:", sessionId);

    const db = await getDb();
    const orders = db.collection("orders");
    const user = getUserFromReq(req);

    let order = null;

    // 1) Try any existing order doc for this sessionId
    order = await orders.findOne({ stripeSessionId: sessionId });

    // 2) If still not found, build it from Stripe Checkout session via REST API
    if (!order) {
      if (!STRIPE_SECRET_KEY) {
        console.error(
          "[orders/sessionId] Cannot fetch from Stripe because STRIPE_SECRET_KEY is missing"
        );
        return res
          .status(404)
          .json({ error: "Order not found (Stripe not configured)." });
      }

      const stripeSession = await fetchStripeSession(sessionId);

      if (!stripeSession) {
        return res.status(404).json({
          error:
            "Order not found (Stripe session missing or invalid for this key)",
        });
      }

      order = buildOrderFromStripe(stripeSession, user);
      console.log(
        "[orders/sessionId] Built new order from Stripe for analytics:",
        {
          stripeSessionId: order.stripeSessionId,
          email: order.email,
          amount: order.amount,
          itemsCount: order.itemsCount,
          storeName: order.storeName,
        }
      );
    } else {
      console.log(
        "[orders/sessionId] Found existing DB order, normalizing analytics fields"
      );
      order = normalizeExistingOrder(order, user);
    }

    // 3) Upsert normalized analytics fields back into Mongo
    try {
      await orders.updateOne(
        { stripeSessionId: order.stripeSessionId },
        { $set: order },
        { upsert: true }
      );

      // Re-fetch so we keep the _id from DB if necessary
      const stored = await orders.findOne({
        stripeSessionId: order.stripeSessionId,
      });
      if (stored) order = stored;

      console.log("[orders/sessionId] Saved order analytics to Mongo:", {
        stripeSessionId: order.stripeSessionId,
        email: order.email,
        amount: order.amount,
        itemsCount: order.itemsCount,
        storeName: order.storeName,
      });
    } catch (e) {
      console.error("[orders/sessionId] Failed to upsert order:", e);
    }

    // Convert _id to string for client
    if (order && order._id) {
      order._id = String(order._id);
    }

    if (!order) {
      return res.status(404).json({
        error: "Order not found (no DB record and no Stripe session)",
      });
    }

    return res.status(200).json(order);
  } catch (err) {
    console.error("[orders/sessionId] Get order error:", err);
    return res
      .status(500)
      .json({ error: "Server error", details: err.message || String(err) });
  }
};

// ---------------- HELPERS ----------------

// Build a normalized order object from a Stripe checkout session
function buildOrderFromStripe(stripeSession, user) {
  const email = normalizeEmail(
    (stripeSession.customer_details &&
      stripeSession.customer_details.email) ||
      stripeSession.customer_email ||
      (user && user.email) ||
      ""
  );

  const createdAt = new Date(
    (stripeSession.created || Date.now() / 1000) * 1000
  );

  const lineItems =
    stripeSession.line_items && stripeSession.line_items.data
      ? stripeSession.line_items.data
      : [];

  // Metadata from the session itself (we might not be setting this yet)
  const sessionMetaStoreName =
    (stripeSession.metadata && stripeSession.metadata.storeName) || null;

  // We’ll collect store names we see on items so we can pick a real one
  const storeCandidates = [];

  const items = lineItems.map((li) => {
    const qty = li.quantity || 1;

    const unitAmountCents =
      (li.price && typeof li.price.unit_amount === "number"
        ? li.price.unit_amount
        : li.amount_total) || 0;
    const unitPrice = unitAmountCents / 100;
    const lineTotal = unitPrice * qty;

    const productName =
      (li.price &&
        li.price.product &&
        (li.price.product.name ||
          (li.price.product.metadata &&
            li.price.product.metadata.displayName))) ||
      li.description ||
      "Item";

    // Try to get store from line-item metadata or product metadata
    const itemStore =
      (li.metadata && li.metadata.store) ||
      (li.price &&
        li.price.product &&
        li.price.product.metadata &&
        li.price.product.metadata.store) ||
      sessionMetaStoreName ||
      null;

    if (itemStore) storeCandidates.push(itemStore);

    return {
      name: productName,
      quantity: qty,
      price: unitPrice,
      lineTotal,
      totalAmount: lineTotal,
      store: itemStore || "Online Order",
      storeLocation:
        (li.metadata && li.metadata.storeLocation) || "Pickup at store",
      deliveryMethod:
        (li.metadata && li.metadata.deliveryMethod) || "Pickup at store",
    };
  });

  const itemsCount = items.reduce(
    (sum, it) => sum + safeNumber(it.quantity || 1),
    0
  );

  const amount =
    typeof stripeSession.amount_total === "number"
      ? stripeSession.amount_total / 100
      : items.reduce(
          (sum, it) =>
            sum +
            (Number(it.price) || 0) * (Number(it.quantity) || 1),
          0
        );

  const currency = String(stripeSession.currency || "CAD").toUpperCase();

  // --------- REAL STORE NAME CHOICE ----------
  // Priority:
  // 1. If ALL items are from the same store, use that.
  // 2. Else if session metadata has storeName, use it.
  // 3. Else fall back to "Online Order".
  let storeName = sessionMetaStoreName || "Online Order";
  const distinctStores = [...new Set(storeCandidates.filter(Boolean))];

  if (distinctStores.length === 1) {
    storeName = distinctStores[0];
  } else if (!sessionMetaStoreName && distinctStores.length > 0) {
    // multiple stores but no explicit meta — pick the first just to avoid "Online Order"
    storeName = distinctStores[0];
  }

  return {
    stripeSessionId: stripeSession.id,

    createdAt,

    // User / email
    userId: user ? user.id : null,
    email,
    userEmail: email,

    // Payment / delivery
    paymentStatus: stripeSession.payment_status || "paid",
    paymentMethod:
      (stripeSession.payment_method_types &&
        stripeSession.payment_method_types[0]) ||
      "card",
    deliveryMethod: "Pickup at store",

    // Order totals
    storeName,
    amount,
    total: amount, // alias
    currency,
    items,
    itemsCount,

    createdFromStripe: true,
  };
}

// Normalize an existing DB order so it also has analytics fields
function normalizeExistingOrder(order, user) {
  const normalized = { ...order };

  const email = normalizeEmail(
    normalized.email ||
      normalized.userEmail ||
      (normalized.user && normalized.user.email) ||
      (user && user.email) ||
      ""
  );
  normalized.email = email;
  normalized.userEmail = email;

  // Recompute a better storeName if we only had "Online Order"
  const firstItem =
    Array.isArray(normalized.items) && normalized.items.length > 0
      ? normalized.items[0]
      : null;

  if (
    !normalized.storeName ||
    normalized.storeName === "Online Order"
  ) {
    normalized.storeName =
      (firstItem && (firstItem.store || firstItem.storeName)) ||
      normalized.store ||
      "Online Order";
  }

  if (
    typeof normalized.itemsCount !== "number" &&
    Array.isArray(normalized.items)
  ) {
    normalized.itemsCount = normalized.items.reduce(
      (sum, it) => sum + safeNumber(it.quantity || it.qty || 1),
      0
    );
  }

  if (typeof normalized.amount !== "number") {
    if (typeof normalized.total === "number") {
      normalized.amount = normalized.total;
    } else if (typeof normalized.amount_total === "number") {
      normalized.amount = normalized.amount_total / 100;
    } else if (Array.isArray(normalized.items)) {
      normalized.amount = normalized.items.reduce(
        (sum, it) =>
          sum +
          (Number(it.price) || 0) * (Number(it.quantity || it.qty || 1) || 0),
        0
      );
    } else {
      normalized.amount = 0;
    }
  }

  if (!normalized.currency) {
    normalized.currency = "CAD";
  }

  return normalized;
}

// Call Stripe Checkout Session REST API using fetch
async function fetchStripeSession(sessionId) {
  try {
    const url =
      "https://api.stripe.com/v1/checkout/sessions/" +
      encodeURIComponent(sessionId) +
      "?expand[]=line_items.data.price.product&expand[]=line_items";

    const resp = await doFetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(
        "[orders/sessionId] Stripe session retrieve failed:",
        resp.status,
        text.slice(0, 200)
      );
      return null;
    }

    const data = await resp.json();
    return data;
  } catch (e) {
    console.error(
      "[orders/sessionId] Error while calling Stripe REST API:",
      e && e.message ? e.message : e
    );
    return null;
  }
}

// Try to infer sessionId from query / params / URL
function getSessionIdFromRequest(req) {
  try {
    const q = req.query || {};

    if (q.sessionId || q.session_id || q.id) {
      return q.sessionId || q.session_id || q.id;
    }

    if (req.params && (req.params.sessionId || req.params.id)) {
      return req.params.sessionId || req.params.id;
    }

    const url = req.url || "";
    const clean = url.split("?")[0];
    const parts = clean.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "");
  } catch {
    return null;
  }
}
