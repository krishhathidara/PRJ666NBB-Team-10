// api/users.js
const { getDb } = require("./_db");

// --- HELPER FUNCTIONS FOR STATS ---
function safeNumber(v) {
  if (typeof v === "number") return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAmount(doc) {
  // Check Stripe cents
  if (typeof doc.amount_total === 'number') return doc.amount_total / 100;
  // Check standard dollars
  if (doc.total !== undefined) return safeNumber(doc.total);
  if (doc.amount !== undefined) return safeNumber(doc.amount);
  // Check receipt summary
  if (doc.summary && doc.summary.total) return safeNumber(doc.summary.total);
  return 0;
}

async function calculateUserStats(db, email, userId) {
  try {
    const filter = { $or: [] };
    if (email) filter.$or.push({ email }, { userEmail: email }, { "user.email": email });
    if (userId) filter.$or.push({ userId }, { ownerId: userId });

    if (filter.$or.length === 0) return null;

    // Fetch ALL orders (including pending) and receipts
    const [orders, receipts] = await Promise.all([
      db.collection("orders").find(filter).toArray(),
      db.collection("receipts").find(filter).toArray()
    ]);

    const all = [...orders, ...receipts];
    let totalSpent = 0;
    let itemsBought = 0;
    const storeStats = {};
    const itemFreq = {};

    for (const doc of all) {
      const orderTotal = normalizeAmount(doc);
      totalSpent += orderTotal;

      // --- LOGIC UPDATE: SPLIT ORDER BY STORE ---
      // If the document has items (Online Order), we split the total by store.
      if (Array.isArray(doc.items) && doc.items.length > 0) {
        
        doc.items.forEach(it => {
          const qty = safeNumber(it.quantity || it.qty || 1);
          // Calculate line price
          const price = safeNumber(it.price || it.unit_amount/100 || 0);
          const lineCost = price * qty;
          
          itemsBought += qty;

          // Track Item Frequency
          const name = it.name || it.productName || "Unknown";
          itemFreq[name] = (itemFreq[name] || 0) + qty;

          // Track Store Spending (Split)
          const store = it.store || doc.storeName || "General";
          if (!storeStats[store]) storeStats[store] = { name: store, spent: 0 };
          
          // We apply the tax rate (approx 1.13) to the item share so the breakdown sums up to the Grand Total
          storeStats[store].spent += (lineCost * 1.13); 
        });

      } else {
        // Fallback for Scanned Receipts (Assign whole total to primary store)
        itemsBought += safeNumber(doc.itemsCount || 1);
        const store = doc.storeName || doc.store || (doc.summary && doc.summary.storeName) || "Other";
        
        if (!storeStats[store]) storeStats[store] = { name: store, spent: 0 };
        storeStats[store].spent += orderTotal;
      }
    }

    const sortedStores = Object.values(storeStats).sort((a, b) => b.spent - a.spent);
    
    let mostBought = "—";
    let maxFreq = 0;
    for(const [k, v] of Object.entries(itemFreq)) {
      if(v > maxFreq) { maxFreq = v; mostBought = k; }
    }

    return {
      totalSpent,
      itemsBought,
      transactions: all.length,
      stores: sortedStores,
      favStore: sortedStores[0]?.name || "—",
      mostBought,
      listsCreated: receipts.length
    };
  } catch (err) {
    console.error("Stats Error:", err);
    return null;
  }
}

module.exports = async function handler(req, res) {
  try {
    const db = await getDb();
    const users = db.collection("users");

    // ---------- GET (User + Stats) ----------
    if (req.method === "GET") {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "Email required" });

      let user = await users.findOne({ email });
      
      // If user doesn't exist yet, create temp obj
      if (!user) {
        user = { email, name: email.split('@')[0] };
      }

      // CALCULATE STATS HERE
      const stats = await calculateUserStats(db, email, user._id?.toString());

      // Return combined data
      return res.status(200).json({
        ...user,
        stats: stats || { 
          totalSpent: 0, itemsBought: 0, transactions: 0, 
          stores: [], favStore: "—", mostBought: "—", listsCreated: 0 
        }
      });
    }

    // ---------- POST ----------
    if (req.method === "POST") {
      const body = req.body || {};
      const { email, name, favStore, stats } = body;
      if (!email) return res.status(400).json({ error: "Email required" });

      await users.updateOne(
        { email },
        { $set: { name, favStore, stats, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.status(200).json({ success: true });
    }

    // ---------- PUT ----------
    if (req.method === "PUT") {
      const body = req.body || {};
      const { email, field, value } = body;

      if (!email || !field)
        return res.status(400).json({ error: "Missing field or email" });

      let updateDoc = {};

      // Handle multi-field profile edit
      if (field === "profile") {
        if (!value || typeof value !== "object")
          return res.status(400).json({ error: "Invalid profile data" });

        updateDoc = {
          ...(value.name && { name: value.name }),
          ...(value.favStore && { favStore: value.favStore }),
          ...(value.email && { email: value.email }),
          updatedAt: new Date(),
        };

        const result = await users.updateOne(
          { email: req.body.email },
          { $set: updateDoc }
        );

        if (result.matchedCount === 0)
          return res.status(404).json({ error: "User not found" });

        return res.status(200).json({ success: true });
      }

      // Single-field update (avatar)
      updateDoc = { [field]: value, updatedAt: new Date() };

      const result = await users.updateOne({ email }, { $set: updateDoc });
      if (result.matchedCount === 0)
        return res.status(404).json({ error: "User not found" });

      return res.status(200).json({ success: true });
    }

    res.setHeader("Allow", ["GET", "POST", "PUT"]);
    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error("❌ users API error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
};