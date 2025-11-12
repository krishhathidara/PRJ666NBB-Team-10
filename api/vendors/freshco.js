// /api/vendors/freshco.js  (main project)
// Server-side proxy to avoid CORS. Reads env FRESHCO_API_URL.
// Works whether FRESHCO_API_URL is a base domain (https://mock-freshco.vercel.app)
// or the full path (https://mock-freshco.vercel.app/api/products).

function normalizeUrl(input) {
  try {
    const u = new URL(input);
    const path = u.pathname.replace(/\/+$/, ""); // trim trailing slash
    // If it doesn't already end with /api/products, append it
    u.pathname = /\/api\/products$/i.test(path) ? path : `${path}/api/products`;
    return u.toString();
  } catch {
    // If env isn't a valid URL, just return as-is (same behavior as walmart.js)
    return input;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  const raw = process.env.FRESHCO_API_URL;
  if (!raw) {
    res.status(500).json({ error: "FRESHCO_API_URL is not set" });
    return;
  }

  const url = normalizeUrl(raw);

  try {
    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await upstream.text();

    // Pass through JSON (and errors) as-is
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(upstream.status).send(text);
  } catch (err) {
    console.error("Proxy freshco error:", err);
    res.status(502).json({ error: "Failed to fetch FreshCo data" });
  }
}
