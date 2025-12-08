// replaceDemoStoreIds.js
const { MongoClient } = require("mongodb");

const uri = "mongodb+srv://jaineeljain05:jaineel123@cluster1.fczdk.mongodb.net/grocery_web_dev?retryWrites=true&w=majority&appName=Cluster1"; // <— paste your own
const client = new MongoClient(uri);

const mapping = {
  store_demo_001: "ChIJQfsqr4fT1IkR3AxI6LT2i6U", // T&T
  store_demo_002: "ChIJV5YjvQZT1IkR3G9I7eM8t8k", // METRO
  store_demo_003: "ChIJT6K-w7Yt1IkR2HZ0fEAZmls", // FRESHCO
  store_demo_004: "ChIJhdA6EwMt1IkRzNfNnWvNv_w", // NO_FRILLS
  store_demo_005: "ChJ0O-7s04_T1lkRNLRUD8pn5do", // FOODY MART
  store_demo_006: "ChIJhdA6EwMt1IkRzNfNnWvNv_w", // FOOD BASICS
};

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected");

    const db = client.db("grocery_web_dev");
    const products = db.collection("products");

    for (const [oldId, newId] of Object.entries(mapping)) {
      const result = await products.updateMany({ storeId: oldId }, { $set: { storeId: newId } });
      console.log(`${oldId} → ${newId}: ${result.modifiedCount} updated`);
    }

    console.log("🔒 Done!");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await client.close();
  }
}

run();
