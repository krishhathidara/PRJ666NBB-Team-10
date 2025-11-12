// api/_db_products.js
const { MongoClient } = require("mongodb");
require("dotenv").config(); // <-- ADD THIS LINE

const uri = process.env.MONGODB_PRODUCTS_URI;
if (!uri) throw new Error("Missing MONGODB_PRODUCTS_URI");

let clientPromise = global._mongoClientProductsPromise;
if (!clientPromise) {
  const client = new MongoClient(uri, { maxPoolSize: 10 });
  clientPromise = client.connect();
  global._mongoClientProductsPromise = clientPromise;
}

async function getProductsDb() {
  const client = await clientPromise;
  return client.db(process.env.MONGODB_PRODUCTS_DB || undefined);
}

module.exports = { getProductsDb };
