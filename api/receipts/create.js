const { getDb } = require("../_db.js");
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, userId } = req.body;

    if (!imageBase64 || !userId) {
      return res.status(400).json({ error: "Missing image or user" });
    }

    console.log("🧠 Sending image to AI for extraction...");

    const parsed = await parseReceiptAI(imageBase64);

    console.log("🧠 AI Parsed Receipt:", parsed);

    const db = await getDb();

    const receiptDoc = {
      userId,
      storeName: parsed.store,
      subtotal: parsed.subtotal,
      tax: parsed.tax,
      total: parsed.total,
      rawText: parsed.rawText || "",
      imageBase64,
      createdAt: new Date()
    };

    const receiptResult = await db.collection("receipts").insertOne(receiptDoc);
    const receiptId = receiptResult.insertedId;

    const itemDocs = parsed.items.map(i => ({
      receiptId,
      userId,
      name: i.name,
      qty: i.qty,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice
    }));

    if (itemDocs.length > 0) {
      await db.collection("receipt_items").insertMany(itemDocs);
    }

    res.json({
      ok: true,
      receiptId,
      items: itemDocs.length
    });

  } catch (err) {
    console.error("❌ AI Receipt Error:", err);
    res.status(500).json({
      error: "Failed to process receipt with AI",
      details: err.message
    });
  }
};


/* ============================================================
   AI RECEIPT PARSER — FIXED FOR REAL JSON OUTPUT
============================================================ */
async function parseReceiptAI(imageBase64) {

  // Ensure correct data URL
  let url = imageBase64;
  if (!url.startsWith("data:image")) {
    url = `data:image/jpeg;base64,${url}`;
  }

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Return ONLY raw JSON. No markdown, no ```json blocks."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Extract store, items{name, qty, unitPrice, totalPrice}, subtotal, tax, total. Return ONLY JSON."
          },
          {
            type: "image_url",
            image_url: { url }
          }
        ]
      }
    ]
  });

  // Raw response text (may contain ```json)
  let raw = response.choices[0].message.content.trim();

  // REMOVE ANY FENCED CODE BLOCKS
  raw = raw.replace(/```json/gi, "");
  raw = raw.replace(/```/g, "");
  raw = raw.trim();

  // Debug print
  console.log("🧹 CLEANED AI RESPONSE:", raw);

  // NOW parse safely
  return JSON.parse(raw);
}
