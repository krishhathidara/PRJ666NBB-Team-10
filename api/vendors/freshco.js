// /api/vendors/freshco.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const url = process.env.FRESHCO_API_URL;
    if (!url)
      return res.status(500).json({ error: "FRESHCO_API_URL not set" });

    const r = await fetch(url);
    if (!r.ok)
      throw new Error(`Upstream error: ${r.status} ${r.statusText}`);

    const data = await r.json();
    res.status(200).json(data);
  } catch (err) {
    console.error("❌ FreshCo Vendor API Error:", err.message);
    res.status(502).json({ error: err.message });
  }
}
