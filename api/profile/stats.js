// api/profile/stats.js
//
// Aggregates analytics for the profile page.
// Uses BOTH email and userId so it works with old and new orders.

const { getDb } = require("../_db.js");
const { getUserFromReq } = require("../_auth.js");

function safeNumber(v) {
  if (typeof v === "number") return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function sum(arr) {
  return arr.reduce((acc, v) => acc + safeNumber(v), 0);
}

function normalizeOrder(order) {
  if (!order || typeof order !== "object") return null;

  const storeName =
    order.storeName ||
    order.store ||
    (Array.isArray(order.items) &&
      order.items[0] &&
      order.items[0].store) ||
    "Unknown store";

  const total =
    safeNumber(order.amount) ||
    safeNumber(order.total) ||
    (order.amount_total ? order.amount_total / 100 : 0);

  let itemsCount = 0;
  if (typeof order.itemsCount === "number") {
    itemsCount = order.itemsCount;
  } else if (Array.isArray(order.items)) {
    itemsCount = order.items.reduce(
      (acc, it) => acc + safeNumber(it.quantity || it.qty || 1),
      0
    );
  }

  return { storeName, total, itemsCount };
}

function normalizeReceipt(r) {
  if (!r || typeof r !== "object") return null;

  const storeName =
    r.storeName ||
    r.store ||
    (r.summary && r.summary.storeName) ||
    "Unknown store";

  const total =
    safeNumber(r.total) ||
    safeNumber(r.amount) ||
    safeNumber(r.summary && r.summary.total);

  let itemsCount = 0;
  if (typeof r.itemsCount === "number") {
    itemsCount = r.itemsCount;
  } else if (Array.isArray(r.items)) {
    itemsCount = r.items.reduce(
      (acc, it) => acc + safeNumber(it.quantity || it.qty || 1),
      0
    );
  }

  return { storeName, total, itemsCount };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const db = await getDb();
    const user = getUserFromReq(req);

    const emailRaw =
      (req.query && req.query.email) || (user && user.email) || "";
    const email = emailRaw ? String(emailRaw).trim().toLowerCase() : null;
    const userId = user && user.id ? user.id : null;

    const filterOr = [];

    if (email) {
      filterOr.push(
        { email },
        { userEmail: email },
        { "user.email": email }
      );
    }

    if (userId) {
      filterOr.push({ userId }, { "user.id": userId });
    }

    if (filterOr.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "No email or user id to filter by" });
    }

    const mongoFilter = { $or: filterOr };

    const ordersCol = db.collection("orders");
    const receiptsCol = db.collection("receipts");

    const [ordersRaw, receiptsRaw] = await Promise.all([
      ordersCol.find(mongoFilter).toArray(),
      receiptsCol.find(mongoFilter).toArray(),
    ]);

    console.log("[profile/stats] Orders found:", ordersRaw.length);
    console.log("[profile/stats] Receipts found:", receiptsRaw.length);

    const orders = ordersRaw.map(normalizeOrder).filter(Boolean);
    const receipts = receiptsRaw.map(normalizeReceipt).filter(Boolean);

    const all = [...orders, ...receipts];

    const totalSpent = sum(all.map((r) => r.total));
    const itemsBought = sum(all.map((r) => r.itemsCount));
    const transactions = all.length;

    // Per-store totals
    const byStore = new Map();
    for (const rec of all) {
      const name = rec.storeName || "Unknown store";
      if (!byStore.has(name)) {
        byStore.set(name, {
          storeName: name,
          totalSpent: 0,
          transactions: 0,
          itemsBought: 0,
        });
      }
      const entry = byStore.get(name);
      entry.totalSpent += rec.total;
      entry.transactions += 1;
      entry.itemsBought += rec.itemsCount;
    }

    const stores = Array.from(byStore.values()).sort(
      (a, b) => b.totalSpent - a.totalSpent
    );
    const topStore = stores[0] || null;

    // Most bought item (orders only)
    const itemCounts = {};
    for (const orderDoc of ordersRaw || []) {
      const itemsArr = Array.isArray(orderDoc.items) ? orderDoc.items : [];
      for (const it of itemsArr) {
        const name =
          it.name || it.description || it.productName || "Unknown item";
        const qty = safeNumber(it.quantity || it.qty || 1);
        itemCounts[name] = (itemCounts[name] || 0) + qty;
      }
    }

    let mostBoughtItemName = null;
    let mostBoughtItemCount = 0;
    for (const [name, count] of Object.entries(itemCounts)) {
      if (count > mostBoughtItemCount) {
        mostBoughtItemCount = count;
        mostBoughtItemName = name;
      }
    }

    return res.status(200).json({
      ok: true,
      email: email || null,
      userId: userId || null,
      totals: {
        totalSpent,
        itemsBought,
        transactions,
      },
      stores,
      topStore,
      quick: {
        listsCreated: receipts.length,
        mostBoughtItemName: mostBoughtItemName || null,
      },
    });
  } catch (err) {
    console.error("Profile stats error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal error while computing stats",
    });
  }
};
