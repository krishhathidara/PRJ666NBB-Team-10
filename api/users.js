// /api/users.js
const { getDb } = require("./_db");

module.exports = async function handler(req, res) {
  try {
    const db = await getDb();
    const users = db.collection("users");

    // ---------- GET ----------
    if (req.method === "GET") {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "Email required" });

      const user = await users.findOne({ email });
      if (!user) return res.status(404).json({ error: "User not found" });

      return res.status(200).json(user);
    }

    // ---------- POST ----------
    if (req.method === "POST") {
      const body = req.body || {};
      const { email, name, favStore, stats } = body;
      if (!email) return res.status(400).json({ error: "Email required" });

      await users.updateOne(
        { email },
        { $set: { name, favStore, stats, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.status(200).json({ success: true });
    }

    // ---------- PUT ----------
    if (req.method === "PUT") {
      const body = req.body || {};
      const { email, field, value } = body;

      if (!email || !field)
        return res.status(400).json({ error: "Missing field or email" });

      let updateDoc = {};

      // 🧠 Handle multi-field profile edit (name, favStore, email)
      if (field === "profile") {
        if (!value || typeof value !== "object")
          return res.status(400).json({ error: "Invalid profile data" });

        updateDoc = {
          ...(value.name && { name: value.name }),
          ...(value.favStore && { favStore: value.favStore }),
          ...(value.email && { email: value.email }),
          updatedAt: new Date(),
        };

        // Update using the OLD email (for identity reference)
        const result = await users.updateOne(
          { email: req.body.email },
          { $set: updateDoc }
        );

        if (result.matchedCount === 0)
          return res.status(404).json({ error: "User not found" });

        console.log(`✅ Updated profile for ${req.body.email}`);
        return res.status(200).json({ success: true });
      }

      // 🖼️ Single-field update (e.g. avatar)
      updateDoc = { [field]: value, updatedAt: new Date() };

      const result = await users.updateOne({ email }, { $set: updateDoc });
      if (result.matchedCount === 0)
        return res.status(404).json({ error: "User not found" });

      console.log(`✅ Updated ${field} for ${email}`);
      return res.status(200).json({ success: true });
    }

    // ---------- METHOD NOT ALLOWED ----------
    res.setHeader("Allow", ["GET", "POST", "PUT"]);
    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error("❌ users API error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
};
