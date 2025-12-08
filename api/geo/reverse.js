export default async function handler(req, res) {
  const { lat, lon } = req.query;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${key}`;
    const r = await fetch(url);
    const j = await r.json();

    if (j.error_message) {
      console.error("Google API error (reverse):", j.error_message);
    }

    const address = j.results?.[0]?.formatted_address || "";
    res.status(200).json({ address });
  } catch (e) {
    console.error("Reverse geocode failed:", e);
    res.status(500).json({ error: "reverse failed" });
  }
}
