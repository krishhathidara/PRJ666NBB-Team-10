// fixStoreIds.js
const { getProductsDb } = require("./_db_products");

async function fix() {
  const db = await getProductsDb();
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
    const res = await products.updateMany(
      { storeId: oldId },
      { $set: { storeId: newId } }
    );
    console.log(`${oldId} → ${newId}: ${res.modifiedCount} updated`);
  }

  console.log("✅ All updates done.");
  process.exit(0);
}

fix().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
