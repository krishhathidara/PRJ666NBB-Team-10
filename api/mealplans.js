// /api/mealplans.js
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("./_db");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const router = express.Router();

// Helper: extract user email from cookie token
function getUserEmailFromCookie(req) {
  try {
    const cookieHeader = req.headers.cookie || "";
    const tokenCookie = cookieHeader
      .split(";")
      .find(c => c.trim().startsWith((process.env.AUTH_COOKIE || "app_session") + "="));

    if (!tokenCookie) return null;
    const token = tokenCookie.split("=")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    return decoded?.email || null;
  } catch {
    return null;
  }
}

// ---------- GET all meal plans for user ----------
router.get("/", async (req, res) => {
  try {
    const email = getUserEmailFromCookie(req);
    if (!email) return res.status(401).json({ error: "Not authenticated" });

    const db = await getDb();
    const mealplans = db.collection("mealplans");
    const plans = await mealplans.find({ userEmail: email }).toArray();

    res.status(200).json(plans);
  } catch (err) {
    console.error("GET mealplans error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ---------- POST create new plan ----------
router.post("/", async (req, res) => {
  try {
    const email = getUserEmailFromCookie(req);
    if (!email) return res.status(401).json({ error: "Not authenticated" });

    const { name, description, ingredients, cost } = req.body || {};
    if (!name || !ingredients)
      return res.status(400).json({ error: "Missing required fields" });

    const db = await getDb();
    const mealplans = db.collection("mealplans");

    await mealplans.insertOne({
      name,
      description: description || "",
      ingredients,
      cost: cost || 0,
      userEmail: email,
      createdAt: new Date(),
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("POST mealplans error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ---------- PUT update existing plan ----------
router.put("/:id", async (req, res) => {
  try {
    const email = getUserEmailFromCookie(req);
    if (!email) return res.status(401).json({ error: "Not authenticated" });

    const db = await getDb();
    const mealplans = db.collection("mealplans");
    const { id } = req.params;
    const { name, description, ingredients, cost } = req.body || {};

    const result = await mealplans.updateOne(
      { _id: new ObjectId(id), userEmail: email },
      { $set: { name, description, ingredients, cost, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Meal plan not found or not yours" });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("PUT mealplans error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ---------- DELETE a plan ----------
router.delete("/:id", async (req, res) => {
  try {
    const email = getUserEmailFromCookie(req);
    if (!email) return res.status(401).json({ error: "Not authenticated" });

    const db = await getDb();
    const mealplans = db.collection("mealplans");
    const { id } = req.params;

    const result = await mealplans.deleteOne({
      _id: new ObjectId(id),
      userEmail: email,
    });

    if (result.deletedCount === 0)
      return res.status(404).json({ error: "Meal plan not found or not yours" });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("DELETE mealplans error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

module.exports = router;
