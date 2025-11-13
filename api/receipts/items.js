const { getDb } = require("../_db.js");
const { ObjectId } = require("mongodb");

module.exports = async (req, res) => {
  try {
    const { receiptId } = req.query;
    if (!receiptId) return res.status(400).json({ error: "receiptId required" });

    const db = await getDb();
    const items = await db
      .collection("receipt_items")
      .find({ receiptId: new ObjectId(receiptId) })
      .toArray();

    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed" });
  }
};
