// /api/vendors/walmart.js  (main project)
// Server-side proxy to avoid CORS. Reads env WALMART_API_URL.

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  const url = process.env.WALMART_API_URL; // e.g. https://mock-walmart-xxxx.vercel.app/api/products
  if (!url) {
    res.status(500).json({ error: "WALMART_API_URL is not set" });
    return;
  }

  try {
    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await upstream.text();

    // Pass through JSON (and errors) as-is
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(upstream.status).send(text);
  } catch (err) {
    console.error("Proxy walmart error:", err);
    res.status(502).json({ error: "Failed to fetch Walmart data" });
  }
}
