// /api/vendors/foodbasics.js  (main project)
// Server-side proxy to avoid CORS. Reads env FOODBASICS_API_URL.
// Accepts either a base URL (https://mock-foodbasics.vercel.app)
// or a full path (https://mock-foodbasics.vercel.app/api/products)

function normalizeUrl(input) {
  try {
    const u = new URL(input);
    const path = u.pathname.replace(/\/+$/, '');
    u.pathname = /\/api\/products$/i.test(path) ? path : `${path}/api/products`;
    return u.toString();
  } catch {
    return input;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  const raw = process.env.FOODBASICS_API_URL; // ensure this is set in Vercel
  if (!raw) {
    res.status(500).json({ error: "FOODBASICS_API_URL is not set" });
    return;
  }

  const url = normalizeUrl(raw);

  try {
    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await upstream.text();

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(upstream.status).send(text);
  } catch (err) {
    console.error("Proxy foodbasics error:", err);
    res.status(502).json({ error: "Failed to fetch Food Basics data" });
  }
}
