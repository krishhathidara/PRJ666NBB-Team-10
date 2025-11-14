// api/receipts/delete.js
const { getDb } = require("../_db.js");
const { ObjectId } = require("mongodb");

module.exports = async (req, res) => {
  // Allow BOTH POST and DELETE
  if (req.method !== "DELETE" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing receipt id" });

    const db = await getDb();

    // Remove receipt
    const delReceipt = await db
      .collection("receipts")
      .deleteOne({ _id: new ObjectId(id) });

    // Remove items linked to receipt
    const delItems = await db
      .collection("receipt_items")
      .deleteMany({ receiptId: new ObjectId(id) });

    return res.json({
      ok: true,
      removed: delReceipt.deletedCount,
      removedItems: delItems.deletedCount
    });

  } catch (err) {
    console.error("Receipt delete error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
