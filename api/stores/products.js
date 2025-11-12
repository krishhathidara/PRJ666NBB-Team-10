// api/stores/products.js
const { getDb } = require("../_db");

module.exports = async function (req, res) {
  try {
    const urlParts = req.url.split("/");
    const storeId = urlParts[urlParts.length - 1];

    if (!storeId) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Missing storeId in URL" }));
    }

    const db = await getDb();
    const products = db.collection("products");

    const items = await products.find({ storeId }).sort({ name: 1 }).toArray();

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ items }));
  } catch (err) {
    console.error("Error fetching products:", err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Server error" }));
  }
};
