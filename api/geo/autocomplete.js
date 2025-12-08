export default async function handler(req, res) {
  const input = (req.query.input || "").slice(0, 120);
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      input
    )}&types=geocode&key=${key}`;
    const r = await fetch(url);
    const j = await r.json();

    if (j.error_message) {
      console.error("Google API error (autocomplete):", j.error_message);
    }

    // Pass through Google's predictions directly so frontend works
    res.status(200).json({ predictions: j.predictions || [] });
  } catch (e) {
    console.error("Autocomplete failed:", e);
    res.status(500).json({ error: "autocomplete failed" });
  }
}
