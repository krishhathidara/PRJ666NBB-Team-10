const { getDb } = require("../_db.js");
const Tesseract = require("tesseract.js");
const { ObjectId } = require("mongodb");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, userId } = req.body;
    if (!imageBase64 || !userId) {
      return res.status(400).json({ error: "Missing data" });
    }

    console.log("📄 Running OCR...");

    const ocr = await Tesseract.recognize(imageBase64, "eng", {
      tessedit_char_whitelist:
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.$-:/() ",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300"
    });

    const rawText = ocr.data.text;

    console.log("====================================");
    console.log("📄 RAW OCR OUTPUT:");
    console.log(rawText);
    console.log("====================================");

    const parsed = parseReceiptText(rawText);

    const db = await getDb();

    // INSERT RECEIPT
    const receiptDoc = {
      userId,
      storeName: parsed.storeName,
      subtotal: parsed.subtotal,
      tax: parsed.tax,
      total: parsed.total,
      rawText,
      createdAt: new Date()
    };

    const receiptResult = await db.collection("receipts").insertOne(receiptDoc);
    const receiptId = receiptResult.insertedId;

    // INSERT ITEMS
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

    console.log("✔ Items stored:", itemDocs.length);

    res.json({
      ok: true,
      receiptId,
      items: itemDocs.length
    });

  } catch (err) {
    console.error("❌ OCR or Parse error:", err);
    res.status(500).json({ error: "OCR failed", details: err.message });
  }
};


// ==================================================================
//  PERFECT RECEIPT PARSER (Food Basics, Walmart, Metro, FreshCo)
// ==================================================================
function parseReceiptText(text) {
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let items = [];
  let subtotal = 0;
  let total = 0;

  let storeName =
    lines.find(l =>
      ["basics","foodbasics","walmart","freshco","metro","nofrills"]
        .some(s => l.toLowerCase().includes(s))
    ) || "Unknown Store";

  // FIXED price regex: allow "|", extra chars, etc
  const priceEnd = /([0-9]+\.[0-9]{2})/;

  // FIXED qty regex: standard pattern
  const qtyParen = /^\((\d+)\)\s*(.*)/;

  let merged = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let next = lines[i + 1] || "";

    // FIX 1 — normalize OCR "(2Y" → "(2)"
    line = line.replace(/\((\d+)Y/, "($1)");

    if (!priceEnd.test(line) && priceEnd.test(next)) {
      merged.push(line + " " + next);
      i++;
    } else {
      merged.push(line);
    }
  }

  for (let line of merged) {
    const lower = line.toLowerCase();

    const skip = [
      "subtotal","total","tax","saving","savings","rounded",
      "cash","change","discount","customer","feedback",
      "sold","hst","receipt"
    ];
    if (skip.some(w => lower.includes(w))) continue;

    let priceMatch = line.match(priceEnd);
    if (!priceMatch) continue;

    let totalPrice = parseFloat(priceMatch[1]);

    let before = line.replace(priceEnd, "").trim();

    let qty = 1;
    let name = before;

    // FIX 2 — now detects "(2)"
    let paren = before.match(qtyParen);
    if (paren) {
      qty = parseInt(paren[1]);
      name = paren[2].trim();
    }

    // CLEAN name (remove “38 $2.29”, stray numbers)
    name = name.replace(/[\d]+\s*\$?\d+\.\d{2}/g, "");
    name = name.replace(/\d+$/g, "");
    name = name.trim();

    let unitPrice = parseFloat((totalPrice / qty).toFixed(2));

    items.push({
      name,
      qty,
      unitPrice,
      totalPrice
    });
  }

  const subLine = lines.find(l => l.toLowerCase().includes("subtotal"));
  if (subLine) {
    let m = subLine.match(priceEnd);
    if (m) subtotal = parseFloat(m[1]);
  }

  const totLine = lines.find(l => l.toLowerCase().startsWith("total"));
  if (totLine) {
    let m = totLine.match(priceEnd);
    if (m) total = parseFloat(m[1]);
  }

  if (!subtotal) subtotal = items.reduce((a,b)=>a + b.totalPrice, 0);
  if (!total) total = subtotal;

  return {
    storeName,
    subtotal,
    tax: 0,
    total,
    items
  };
}
