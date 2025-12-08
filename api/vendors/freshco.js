// /api/vendors/freshco.js
// Server-side proxy for FreshCo. Uses FRESHCO_API_URL.
// No node-fetch import – uses built-in fetch (Node 18 on Vercel).

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  const url = process.env.FRESHCO_API_URL;
  if (!url) {
    res.status(500).json({ error: "FRESHCO_API_URL is not set" });
    return;
  }

  try {
    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await upstream.text();

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(upstream.status).send(text);
  } catch (err) {
    console.error("Proxy freshco error:", err);
    res.status(502).json({ error: "Failed to fetch FreshCo data" });
  }
}
