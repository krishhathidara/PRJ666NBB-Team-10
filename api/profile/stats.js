const { getDb } = require("../_db.js");
const { getUserFromReq } = require("../_auth.js");

function safeNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function sum(arr) {
  return arr.reduce((a, b) => a + safeNumber(b), 0);
}

function normalizeOrder(order) {
  if (!order) return null;

  const storeName =
    order.storeName ||
    order.store ||
    (Array.isArray(order.items) &&
      order.items[0] &&
      (order.items[0].storeName ||
        order.items[0].store ||
        order.items[0].vendor)) ||
    "Unknown Store";

  const total =
    safeNumber(order.total) ||
    safeNumber(order.amount) ||
    (order.amount_total ? order.amount_total / 100 : 0);

  const itemsCount = Array.isArray(order.items)
    ? order.items.reduce(
        (acc, it) => acc + safeNumber(it.quantity || it.qty || 1),
        0
      )
    : 0;

  return { storeName, total, itemsCount };
}

function normalizeReceipt(r) {
  if (!r) return null;

  const storeName =
    r.storeName ||
    r.store ||
    (r.summary && r.summary.storeName) ||
    "Unknown Store";

  const total =
    safeNumber(r.total) ||
    safeNumber(r.amount) ||
    safeNumber(r.summary && r.summary.total);

  const itemsCount = Array.isArray(r.items)
    ? r.items.reduce(
        (acc, it) => acc + safeNumber(it.quantity || it.qty || 1),
        0
      )
    : 0;

  return { storeName, total, itemsCount };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const db = await getDb();
    const user = getUserFromReq(req);

    const email = user?.email || null;
    const userId = user?.id || null;

    if (!email && !userId)
      return res
        .status(400)
        .json({ ok: false, error: "Missing user identifier" });

    const filter = {
      $or: [
        { userEmail: email },
        { email },
        { "user.email": email },
        { userId },
        { "user.id": userId },
      ],
    };

    const ordersRaw = await db.collection("orders").find(filter).toArray();
    const receiptsRaw = await db.collection("receipts").find(filter).toArray();

    const orders = ordersRaw.map(normalizeOrder).filter(Boolean);
    const receipts = receiptsRaw.map(normalizeReceipt).filter(Boolean);

    const all = [...orders, ...receipts];

    const totalSpent = sum(all.map((x) => x.total));
    const itemsBought = sum(all.map((x) => x.itemsCount));
    const transactions = all.length;

    // Aggregate by store
    const byStore = new Map();
    for (const rec of all) {
      const name = rec.storeName || "Unknown Store";
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
      entry.transactions++;
      entry.itemsBought += rec.itemsCount;
    }

    const stores = [...byStore.values()].sort(
      (a, b) => b.totalSpent - a.totalSpent
    );

    return res.json({
      ok: true,
      email,
      userId,
      totals: { totalSpent, itemsBought, transactions },
      stores,
      topStore: stores[0] || null,
      quick: {
        listsCreated: receipts.length,
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
