// /api/vendors/metro.js  (main project)
// Server-side proxy to avoid CORS. Reads env METRO_API_URL.
// Accepts either a base URL (https://mock-metro.vercel.app)
// or a full path (https://mock-metro.vercel.app/api/products)

function normalizeMetroUrl(input) {
  try {
    const u = new URL(input);
    const path = u.pathname.replace(/\/+$/, ''); // trim trailing slash
    // If it doesn't already end with /api/products, append it
    u.pathname = /\/api\/products$/i.test(path) ? path : `${path}/api/products`;
    return u.toString();
  } catch {
    // If env is not a valid URL, just return as-is (behaves like walmart.js)
    return input;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  const raw = process.env.METRO_API_URL;
  if (!raw) {
    res.status(500).json({ error: "METRO_API_URL is not set" });
    return;
  }

  const url = normalizeMetroUrl(raw);

  try {
    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await upstream.text();

    // Pass through JSON (and errors) as-is
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(upstream.status).send(text);
  } catch (err) {
    console.error("Proxy metro error:", err);
    res.status(502).json({ error: "Failed to fetch Metro data" });
  }
}
