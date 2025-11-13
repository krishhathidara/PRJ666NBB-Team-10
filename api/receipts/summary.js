const { getDb } = require("../_db.js");

module.exports = async (req, res) => {
  const { userId } = req.query;

  const db = await getDb();

  const total = await db.collection("receipts").aggregate([
    { $match: { userId } },
    { $group: { _id: null, total: { $sum: "$total" } } }
  ]).toArray();

  res.json({
    totalSpent: total[0]?.total || 0
  });
};
