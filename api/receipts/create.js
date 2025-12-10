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

    console.log("🧠 FINAL PARSED RECEIPT:", parsed);

    const db = await getDb();

    const receiptDoc = {
      userId,
      storeName: parsed.store || "Unknown Store",
      subtotal: parsed.subtotal || 0,
      tax: parsed.tax || 0,
      total: parsed.total || 0,
      rawText: parsed.rawText || "",
      imageBase64,
      createdAt: new Date()
    };

    const receiptResult = await db.collection("receipts").insertOne(receiptDoc);
    const receiptId = receiptResult.insertedId;

    const itemDocs = (parsed.items || []).map(i => ({
      receiptId,
      userId,
      name: i.name || "Unknown Item",
      qty: Number(i.qty) || 1,
      unitPrice: Number(i.unitPrice) || 0,
      totalPrice: Number(i.totalPrice) || 0
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
   AI RECEIPT PARSER — HARDENED & ALWAYS RETURNS VALID JSON
============================================================ */
async function parseReceiptAI(imageBase64) {
  let url = imageBase64;

  if (!url.startsWith("data:image")) {
    url = `data:image/jpeg;base64,${url}`;
  }

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Return ONLY raw JSON. NO markdown, NO code fence, NO explanation."
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

  let raw = response.choices[0].message.content.trim();

  // REMOVE ANY POSSIBLE CODE BLOCKS OR TEXT
  raw = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/^[A-Za-z\s:]+$/g, "") // remove accidental text responses
    .trim();

  console.log("🧹 CLEANED AI OUTPUT:", raw);

  // SAFE PARSE WRAPPER
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("❌ JSON Parse Failed — AI Returned Non-JSON:", raw);

    // RETURN FALLBACK so server NEVER crashes
    return {
      store: "Unknown",
      subtotal: 0,
      tax: 0,
      total: 0,
      rawText: raw,
      items: []
    };
  }
}
