// api/profile/stats.js

const { getDb } = require("../_db.js");
const { getUserFromReq } = require("../_auth.js");

// Helper: safe number conversion
function safeNumber(v) {
  if (typeof v === "number") return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Helper: Normalize currency
// Stripe stores amounts in cents (integers), Receipts usually in dollars (floats)
function normalizeAmount(doc) {
  // 1. Check for Stripe 'amount_total' (cents)
  if (typeof doc.amount_total === 'number') {
    return doc.amount_total / 100;
  }
  // 2. Check for standard 'amount' or 'total'
  if (doc.amount !== undefined) return safeNumber(doc.amount);
  if (doc.total !== undefined) return safeNumber(doc.total);
  
  // 3. specific check for receipts summary
  if (doc.summary && doc.summary.total !== undefined) {
    return safeNumber(doc.summary.total);
  }

  return 0;
}

// Helper: Normalize Item Counts
function normalizeItemsCount(doc) {
  // If explicitly set
  if (typeof doc.itemsCount === 'number') return doc.itemsCount;
  
  // Calculate from items array
  if (Array.isArray(doc.items)) {
    return doc.items.reduce((acc, item) => {
      const qty = item.quantity || item.qty || 1;
      return acc + safeNumber(qty);
    }, 0);
  }
  return 0;
}

// Helper: Get Store Name
function getStoreName(doc) {
  return doc.storeName || 
         doc.store || 
         (doc.summary && doc.summary.storeName) || 
         (Array.isArray(doc.items) && doc.items[0] && doc.items[0].store) || 
         "Other";
}

module.exports = async (req, res) => {
  // Allow GET only
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const db = await getDb();
    const user = getUserFromReq(req);

    // 1. Identify User (by Email AND ID to be thorough)
    const emailRaw = (req.query.email || user?.email || "").trim().toLowerCase();
    const userId = user?.id || null;

    if (!emailRaw && !userId) {
      return res.status(400).json({ ok: false, error: "Not authenticated or no email provided" });
    }

    // 2. Build Query to find ALL user data
    const filterConditions = [];
    
    if (emailRaw) {
      filterConditions.push({ email: emailRaw });
      filterConditions.push({ userEmail: emailRaw });
      filterConditions.push({ "user.email": emailRaw });
    }
    
    if (userId) {
      filterConditions.push({ userId: userId });
      filterConditions.push({ "user.id": userId });
      filterConditions.push({ ownerId: userId });
    }

    const query = { $or: filterConditions };

    // 3. Fetch Data Concurrently
    const [orders, receipts] = await Promise.all([
      db.collection("orders").find(query).toArray(),
      db.collection("receipts").find(query).toArray()
    ]);

    // 4. Aggregate Data
    const allTransactions = [...orders, ...receipts];

    let totalSpent = 0;
    let itemsBought = 0;
    const storeStats = {}; // { "Walmart": { spent: 100, count: 2 } }
    const itemFrequency = {};

    for (const doc of allTransactions) {
      const amt = normalizeAmount(doc);
      const count = normalizeItemsCount(doc);
      const store = getStoreName(doc) || "Unknown Store";

      totalSpent += amt;
      itemsBought += count;

      // Update Store Stats
      if (!storeStats[store]) {
        storeStats[store] = { name: store, spent: 0, transactions: 0 };
      }
      storeStats[store].spent += amt;
      storeStats[store].transactions += 1;

      // Track Items (mainly from orders which have item details)
      if (Array.isArray(doc.items)) {
        doc.items.forEach(it => {
          const name = it.name || it.productName || it.description || "Unknown Item";
          const qty = safeNumber(it.quantity || it.qty || 1);
          itemFrequency[name] = (itemFrequency[name] || 0) + qty;
        });
      }
    }

    // 5. Sort & Rank
    // Convert storeStats object to array
    const sortedStores = Object.values(storeStats).sort((a, b) => b.spent - a.spent);
    
    // Find most bought item
    let mostBoughtName = "—";
    let maxFreq = 0;
    for (const [name, freq] of Object.entries(itemFrequency)) {
      if (freq > maxFreq) {
        maxFreq = freq;
        mostBoughtName = name;
      }
    }

    // 6. Respond
    res.status(200).json({
      ok: true,
      totals: {
        spent: totalSpent,
        items: itemsBought,
        transactions: allTransactions.length
      },
      stores: sortedStores, // For the chart
      favStore: sortedStores.length > 0 ? sortedStores[0].name : "—",
      mostBought: mostBoughtName,
      listsCreated: receipts.length
    });

  } catch (err) {
    console.error("[Profile Stats] Server Error:", err);
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
};