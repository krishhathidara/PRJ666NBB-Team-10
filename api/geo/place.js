export default async function handler(req, res) {
  const id = req.query.id;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
      id
    )}&fields=geometry,formatted_address,name&key=${key}`;
    const r = await fetch(url);
    const j = await r.json();

    if (j.error_message) {
      console.error("Google API error (place):", j.error_message);
    }

    const result = j.result || {};
    res.status(200).json({
      lat: result.geometry?.location?.lat,
      lon: result.geometry?.location?.lng,
      address: result.formatted_address,
      name: result.name
    });
  } catch (e) {
    console.error("Place details failed:", e);
    res.status(500).json({ error: "details failed" });
  }
}
