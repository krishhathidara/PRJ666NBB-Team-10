import path from 'path';
import fs from 'fs/promises';

export default async function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), 'mock-metro', 'data', 'products.json');
    const data = await fs.readFile(filePath, 'utf-8');
    const json = JSON.parse(data);

    if (!json || !Array.isArray(json.products)) {
      return res.status(500).json({ error: "Malformed product data" });
    }

    res.status(200).json(json);
  } catch (err) {
    console.error("Failed to load Metro data:", err.message);
    res.status(500).json({ error: "Metro data fetch failed" });
  }
}
