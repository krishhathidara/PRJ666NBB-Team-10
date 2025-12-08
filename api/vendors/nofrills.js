// /api/vendors/nofrills.js
// Serverless API endpoint for NoFrills mock data
import path from "path";
import fs from "fs/promises";

// Node 18+ has fetch built-in; if not, polyfill
if (!global.fetch) {
  global.fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Main handler
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const API_URL = process.env.NOFRILLS_API_URL;
    if (!API_URL) {
      console.error("❌ Missing NOFRILLS_API_URL in .env");
      return res.status(500).json({ error: "NOFRILLS_API_URL not configured" });
    }

    console.log("🔗 Fetching NoFrills data from:", API_URL);
    const upstream = await fetch(API_URL, { headers: { Accept: "application/json" } });
    const text = await upstream.text();

    if (!upstream.ok) {
      console.error("❌ Upstream error:", upstream.status, upstream.statusText);
      return res.status(502).json({ error: `Upstream error ${upstream.status}` });
    }

    // Try to parse JSON
    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch (e) {
      console.warn("⚠️ Non-JSON response from NoFrills:", e);
      return res.status(200).send(text);
    }
  } catch (err) {
    console.error("❌ /api/vendors/nofrills failed:", err);
    return res.status(500).json({ error: "Failed to fetch NoFrills data" });
  }
}
