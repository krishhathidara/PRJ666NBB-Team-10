// api/receipts/details.js
const { getDb } = require("../_db.js");
const { ObjectId } = require("mongodb");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    const db = await getDb();

    const receipt = await db
      .collection("receipts")
      .findOne({ _id: new ObjectId(id) });

    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found" });
    }

    const items = await db
      .collection("receipt_items")
      .find({ receiptId: new ObjectId(id) })
      .toArray();

    return res.json({ ok: true, receipt, items });
  } catch (err) {
    console.error("Receipt details error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
