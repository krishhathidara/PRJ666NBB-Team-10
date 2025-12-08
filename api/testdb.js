// /api/testdb.js
const { getDb } = require('./_db');

module.exports = async function handler(req, res) {
  try {
    const db = await getDb();
    const collections = await db.listCollections().toArray();

    res.status(200).json({
      success: true,
      database: db.databaseName,
      collections: collections.map(c => c.name),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
