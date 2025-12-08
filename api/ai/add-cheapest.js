// /api/ai/add-cheapest.js
const { getDb } = require("../_db");
const { getUserFromReq } = require("../_auth");

const WALMART_API_URL = process.env.WALMART_API_URL;
const METRO_API_URL = process.env.METRO_API_URL;
const FRESHCO_API_URL = process.env.FRESHCO_API_URL;
const NOFRILLS_API_URL = process.env.NOFRILLS_API_URL;

// helper to safely parse JSON
function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchVendorProducts(name, url) {
  if (!url) return [];
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    const json = safeJson(text);
    let products = [];

    if (Array.isArray(json)) {
      products = json;
    } else if (json && Array.isArray(json.products)) {
      products = json.products;
    }

    return products.map((p) => ({ ...p, _vendorName: name }));
  } catch (err) {
    console.error(`add-cheapest: error fetching ${name}:`, err);
    return [];
  }
}

function cleanSearchTerm(raw) {
  const s = String(raw || "").toLowerCase();
  // strip obvious leading quantities/units like "300 g", "1 cup", etc.
  const stripped = s.replace(
    /^[0-9]+(\.[0-9]+)?\s*(g|gram|grams|kg|ml|l|litre|liter|tsp|tbsp|cup|cups|piece|pieces|clove|cloves)\b\s*/i,
    ""
  );
  return stripped.trim();
}

function productPrice(p) {
  const candidates = [
    p.price,
    p.salePrice,
    p.unit_price,
    p.unitPrice,
    p.current_price,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method && req.method !== "POST") {
    if (res.setHeader) res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = getUserFromReq(req);
    if (!user || !user.email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body =
      typeof req.body === "string" ? safeJson(req.body) || {} : req.body || {};
    const ingredients = Array.isArray(body.ingredients)
      ? body.ingredients
      : [];

    if (!ingredients.length) {
      return res
        .status(400)
        .json({ error: "ingredients[] is required in request body" });
    }

    // fetch all store products once
    const [walmart, metro, freshco, nofrills] = await Promise.all([
      fetchVendorProducts("Walmart", WALMART_API_URL),
      fetchVendorProducts("Metro", METRO_API_URL),
      fetchVendorProducts("FreshCo", FRESHCO_API_URL),
      fetchVendorProducts("No Frills", NOFRILLS_API_URL),
    ]);

    const allProducts = [...walmart, ...metro, ...freshco, ...nofrills];

    const db = await getDb();
    const cart = db.collection("cart");

    const added = [];
    const missing = [];

    for (const raw of ingredients) {
      const term = cleanSearchTerm(raw);
      if (!term) continue;

      const words = term.split(/\s+/).filter(Boolean);
      if (!words.length) continue;

      let best = null;

      for (const p of allProducts) {
        const name = String(p.name || p.title || "").toLowerCase();
        if (!name) continue;

        const matches = words.every((w) => name.includes(w));
        if (!matches) continue;

        const price = productPrice(p);
        if (!price) continue;

        if (!best || price < best.price) {
          best = {
            productId: String(p.id || p._id || p.sku || name),
            name: p.name || p.title || term,
            store: p.storeName || p.store || p.retailer || p._vendorName,
            price,
          };
        }
      }

      if (best) {
        await cart.updateOne(
          { userEmail: user.email, productId: best.productId },
          {
            $set: {
              userEmail: user.email,
              productId: best.productId,
              name: best.name,
              store: best.store,
              price: best.price,
            },
            $inc: { quantity: 1 }, // quantity not super important – 1 is fine
          },
          { upsert: true }
        );
        added.push({ ingredient: term, product: best });
      } else {
        missing.push(term);
      }
    }

    const items = await cart.find({ userEmail: user.email }).toArray();

    return res.status(200).json({
      success: true,
      added,
      missing,
      items,
    });
  } catch (err) {
    console.error("add-cheapest handler error:", err);
    return res
      .status(500)
      .json({ error: "Server error: " + (err.message || String(err)) });
  }
};
