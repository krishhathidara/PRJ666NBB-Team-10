const { getDb } = require("../_db.js");

module.exports = async (req, res) => {
  const userId = req.query.userId;
  const db = await getDb();

  const items = await db.collection("receipt_items").aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: "$name",
        timesBought: { $sum: "$qty" },
        totalSpent: { $sum: "$totalPrice" }
      }
    },
    { $sort: { timesBought: -1 } },
    { $limit: 10 }
  ]).toArray();

  res.json(items);
};
