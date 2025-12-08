// /api/mealplans.js
const { ObjectId } = require("mongodb");
const { getDb } = require("./_db");
const { getUserFromReq } = require("./_auth");

function getIdFromReq(req) {
  try {
    const url = (req.url || "").split("?")[0];
    const parts = url.split("/").filter(Boolean);
    if (!parts.length) return null;
    const last = parts[parts.length - 1];
    if (last === "mealplans") return null;
    return last;
  } catch {
    return null;
  }
}

function serialize(plan) {
  if (!plan) return null;
  return {
    _id: plan._id?.toString(),
    userId: plan.userId,
    userEmail: plan.userEmail,
    name: plan.name,
    description: plan.description || "",
    ingredients: Array.isArray(plan.ingredients) ? plan.ingredients : [],
    cost: typeof plan.cost === "number" ? plan.cost : 0,
    type: plan.type || "Custom",
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST", "PUT", "DELETE"].includes(req.method)) {
    if (res.setHeader) res.setHeader("Allow", "GET,POST,PUT,DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = getUserFromReq(req);
  if (!user || !user.id || !user.email) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = await getDb();
  const col = db.collection("mealplans");
  const idParam = getIdFromReq(req);

  try {
    if (req.method === "GET") {
      if (idParam) {
        let plan;
        try {
          plan = await col.findOne({
            _id: new ObjectId(idParam),
            userId: user.id,
          });
        } catch {
          return res.status(404).json({ error: "Plan not found" });
        }
        if (!plan) return res.status(404).json({ error: "Plan not found" });
        return res.status(200).json(serialize(plan));
      }

      const plans = await col
        .find({ userId: user.id })
        .sort({ createdAt: -1 })
        .toArray();
      return res.status(200).json(plans.map(serialize));
    }

    // Parse body
    const body =
      req.body && typeof req.body === "object" ? req.body : {};

    if (req.method === "POST") {
      const { name, description, ingredients, cost } = body;

      if (!name || !Array.isArray(ingredients) || !ingredients.length) {
        return res.status(400).json({ error: "Missing name or ingredients" });
      }

      const now = new Date();

      const doc = {
        userId: user.id,
        userEmail: user.email,
        name: String(name),
        description: String(description || ""),
        ingredients: ingredients,   // ← FIXED (no map(String))
        cost: Number(cost) || 0,
        type: "Custom",
        createdAt: now,
        updatedAt: now,
      };

      const { insertedId } = await col.insertOne(doc);
      return res
        .status(201)
        .json({
          success: true,
          id: insertedId.toString(),
          plan: serialize({ _id: insertedId, ...doc })
        });
    }

    if (req.method === "PUT") {
      if (!idParam) {
        return res.status(400).json({ error: "Missing plan id" });
      }

      const { name, description, ingredients, cost } = body;

      if (!name || !Array.isArray(ingredients) || !ingredients.length) {
        return res.status(400).json({ error: "Missing name or ingredients" });
      }

      const update = {
        $set: {
          name: String(name),
          description: String(description || ""),
          ingredients: ingredients,   // ← FIXED (no map(String))
          cost: Number(cost) || 0,
          updatedAt: new Date(),
        },
      };

      const result = await col.updateOne(
        { _id: new ObjectId(idParam), userId: user.id },
        update
      );

      if (!result.matchedCount) {
        return res.status(404).json({ error: "Plan not found" });
      }

      return res.status(200).json({ success: true });
    }

    if (req.method === "DELETE") {
      if (!idParam) {
        return res.status(400).json({ error: "Missing plan id" });
      }

      const result = await col.deleteOne({
        _id: new ObjectId(idParam),
        userId: user.id,
      });

      if (!result.deletedCount) {
        return res.status(404).json({ error: "Plan not found" });
      }

      return res.status(200).json({ success: true });
    }
  } catch (err) {
    console.error("Mealplans API error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
};
