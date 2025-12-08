// /api/vendors/metro.js
// Server-side proxy for Metro. Uses METRO_API_URL.

export default async function handler(req, res) {
  // Cache at the edge for 1 minute, allow stale while revalidating
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  const url = process.env.METRO_API_URL; // e.g. https://mock-metro-xxxx.vercel.app/api/products
  if (!url) {
    res.status(500).json({ error: "METRO_API_URL is not set" });
    return;
  }

  try {
    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await upstream.text();

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(upstream.status).send(text);
  } catch (err) {
    console.error("Proxy metro error:", err);
    res.status(502).json({ error: "Failed to fetch Metro data" });
  }
}
