// api/stores/[storeId]/products.js
const { getProductsDb } = require("../../_db_products");

module.exports = async function (req, res) {
  try {
    // ✅ Correctly capture storeId from route or query
    const storeId = req.params.storeId || req.query.storeId;

    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }

    console.log(`🔍 Fetching products for storeId: ${storeId}`);

    // ✅ Connect to MongoDB products database
    const db = await getProductsDb();

    // ✅ Query products collection by exact storeId
    const products = await db
      .collection("products")
      .find({ storeId: storeId })
      .toArray();

    // ✅ Handle empty result
    if (!products || products.length === 0) {
      console.warn(`⚠️ No products found for storeId: ${storeId}`);
      return res
        .status(404)
        .json({ message: `No products found for storeId ${storeId}`, storeId });
    }

    console.log(`✅ Found ${products.length} products for storeId: ${storeId}`);
    res.status(200).json({
      storeId,
      count: products.length,
      products,
    });
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};
