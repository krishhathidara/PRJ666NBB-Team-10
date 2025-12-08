const { MongoClient } = require("mongodb");

const uri = "your MongoDB Atlas connection string here";
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db("grocery_web_dev");
  const products = db.collection("products");

  const updates = [
    ["T&T_SUPERMARKET", "ChIJQfsqr4fT1IkR3AxI6LT2i6U"],
    ["FOODY_MART", "ChJ0O-7s04_T1lkRNLRUD8pn5do"],
    ["METRO", "ChIJV5YjvQZT1IkR3G9I7eM8t8k"],
    ["FRESHCO", "ChIJT6K-w7Yt1IkR2HZ0fEAZmls"],
    ["NO_FRILLS", "ChIJhdA6EwMt1IkRzNfNnWvNv_w"],
    ["FOOD_BASICS", "ChIJhdA6EwMt1IkRzNfNnWvNv_w"],
  ];

  for (const [oldId, newId] of updates) {
    const result = await products.updateMany({ storeId: oldId }, { $set: { storeId: newId } });
    console.log(`${oldId} → ${newId}: ${result.modifiedCount} updated`);
  }

  await client.close();
}

run().catch(console.error);
