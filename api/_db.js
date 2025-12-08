// api/_db.js (CommonJS) – MongoDB connection with global cache
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Missing MONGODB_URI');

let clientPromise = global._mongoClientPromise;
if (!clientPromise) {
  const client = new MongoClient(uri, { maxPoolSize: 10 });
  clientPromise = client.connect();
  global._mongoClientPromise = clientPromise;
}

async function getDb() {
  const client = await clientPromise;
  // If the DB name is embedded in MONGODB_URI it will be used; otherwise provide one:
  return client.db(process.env.MONGODB_DB || undefined);
}

module.exports = { getDb };
