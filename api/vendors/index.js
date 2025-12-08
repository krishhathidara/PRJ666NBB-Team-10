export default async function handler(req, res) {
  const { store } = req.query;

  let url;
  if (store === 'walmart') url = process.env.WALMART_API_URL;
  else if (store === 'metro') url = process.env.METRO_API_URL;
  else if (store === 'freshco') url = process.env.FRESHCO_API_URL;
  else if (store === 'nofrills') url = process.env.NOFRILLS_API_URL;
  else return res.status(400).json({ error: 'Unsupported store' });

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
}
