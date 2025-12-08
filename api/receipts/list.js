// api/receipts/list.js
const { getDb } = require("../_db.js");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const db = await getDb();
    const receipts = await db
      .collection("receipts")
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ ok: true, receipts });
  } catch (err) {
    console.error("Receipt list error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
