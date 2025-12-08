const { MongoClient } = require("mongodb");

// 🔹 Replace with your own Atlas URI
const uri = "mongodb+srv://jaineeljain05:jaineel123@cluster1.fczdk.mongodb.net/grocery_web_dev?retryWrites=true&w=majority&appName=Cluster1";
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  console.log("✅ Connected");
  const db = client.db("grocery_web_dev");
  const products = db.collection("products");

 const updates = [
  ["T&T_SUPERMARKET", "ChIJQfsqr4fT1IkR3AxI6LT2i6U"],
  ["FOODY_MART", "ChJ0O-7s04_T1lkRNLRUD8pn5do"],
  ["METRO", "ChIJV5YjvQZT1IkR3G9I7eM8t8k"],
  ["FRESHCO", "ChIJT6K-w7Yt1IkR2HZ0fEAZmls"],
  ["NO_FRILLS", "ChIJhdA6EwMt1IkRzNfNnWvNv_w"],
  ["FOOD_BASICS", "ChIJhdA6EwMt1IkRzNfNnWvNv_w"],
  ["TNT_SUPERMARKET", "ChIJQfsqr4fT1IkR3AxI6LT2i6U"],
  ["T&T", "ChIJQfsqr4fT1IkR3AxI6LT2i6U"],
];


  for (const [oldId, newId] of updates) {
    const res = await products.updateMany({ storeId: oldId }, { $set: { storeId: newId } });
    console.log(`${oldId} → ${newId}: ${res.modifiedCount} updated`);
  }

  await client.close();
  console.log("🔒 Done.");
}

run().catch(console.error);
