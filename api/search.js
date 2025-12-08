// /api/search.js
import { getDb } from "./_db"; // (still fine even if not used)

export default async function handler(req, res) {
  const q = (req.query.q || "").trim().toLowerCase();
  if (!q) return res.json({ results: [] });

  const vendors = [
    { id: "walmart", url: process.env.WALMART_API_URL },
    { id: "metro", url: process.env.METRO_API_URL },
    { id: "freshco", url: process.env.FRESHCO_API_URL },
    { id: "nofrills", url: process.env.NOFRILLS_API_URL },
    { id: "foodbasics", url: process.env.FOODBASICS_API_URL },
  ];

  const words = q.split(/\s+/).filter(Boolean);
  let results = [];

  try {
    for (const v of vendors) {
      if (!v.url) continue;

      const upstream = await fetch(v.url, {
        headers: { Accept: "application/json" },
      });
      const json = await upstream.json();
      const items = json.products || json;
      if (!Array.isArray(items)) continue;

      items
        .filter((p) => {
          const name = (p.title || p.name || "").toLowerCase();
          const category = (
            p.category ||
            p.department ||
            p.aisle ||
            p.type ||
            ""
          ).toLowerCase();

          // match if EVERY word is in name OR category
          return words.every(
            (w) => name.includes(w) || category.includes(w)
          );
        })
        .forEach((p) => {
          results.push({
            name: p.title || p.name,
            img: p.imageUrl || p.image || "",
            price: p.price || 0,
            storeId: v.id,
            unit: p.unit || "",
          });
        });
    }

    res.json({ results });
  } catch (err) {
    console.error("SEARCH ERROR:", err);
    res.status(500).json({ results: [] });
  }
}
