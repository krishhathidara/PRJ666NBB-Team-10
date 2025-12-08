import fetch from 'node-fetch';

export default async function handler(req, res){
  const { lat, lon } = req.query;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });
  try{
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=4000&type=supermarket&key=${key}`;
    const r = await fetch(url); const j = await r.json();
    const list = (j.results || []).map(x => {
      const ref = x.photos?.[0]?.photo_reference;
      const img = ref
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${ref}&key=${key}`
        : "https://images.unsplash.com/photo-1519677100203-a0e668c92439?auto=format&fit=crop&w=1200&q=60";
      return { name:x.name, lat:x.geometry.location.lat, lon:x.geometry.location.lng, img };
    });
    res.json(list);
  }catch(e){ res.status(500).json({ error:"nearby failed" }); }
}
