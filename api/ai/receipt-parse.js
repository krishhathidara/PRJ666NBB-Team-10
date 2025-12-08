// api/ai/receipt-parse.js
// Turn messy OCR text into structured receipt data using Groq

/* eslint-disable no-console */

const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Fallback fetch for older Node / Vercel runtimes
let doFetch = global.fetch;
if (!doFetch) {
  doFetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));
}

// ----- Call Groq -----
async function callGroqForReceipt(rawText, storeHint, currencyHint) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set in environment");
  }

  const systemPrompt = `
You are a very careful assistant that parses OCR text from grocery store receipts.
Your ONLY knowledge is the text you see in the receipt. DO NOT invent prices or items.

You must return VALID JSON ONLY in this exact structure:

{
  "storeName": string | null,
  "storeLocation": string | null,
  "purchaseDate": string | null,      // ISO 8601 if you can, otherwise as it appears
  "currency": "CAD" | "USD" | string, // best guess from receipt; default to hint or "CAD"
  "lineItems": [
    {
      "name": string,                 // product name from the receipt
      "quantity": number,             // default 1 if not obvious
      "unitPrice": number | null,     // price for ONE unit, or null if unknown
      "lineTotal": number | null,     // total for this line, or null if unknown
      "rawLine": string               // original line snippet
    }
  ],
  "subtotal": number | null,
  "tax": number | null,
  "total": number | null,
  "notes": string                    // any comments about uncertainty or assumptions
}

Rules:
- ONLY use numbers that actually appear in the receipt text.
- Do NOT guess or "fix" prices using your own knowledge.
- Skip loyalty points, change, card numbers, coupons (unless clearly a per-item discount).
- Ignore header/footer noise like "THANK YOU", URLs, etc.
- Ignore rows that are clearly totals (SUBTOTAL, TOTAL, HST, TAX, etc.) as line items.
- If a line shows something like "BANANAS 1.32 kg @ 1.99  2.63",
  then quantity = 1.32, unitPrice = 1.99, lineTotal = 2.63.
- If only a single price appears and quantity is unclear, assume quantity = 1 and price is lineTotal.
- Round all numeric values to 2 decimal places.
- If you are unsure of something, put null and explain in "notes".
`;

  const userPrompt = `
Raw OCR text from a grocery receipt:

"""
${rawText}
"""

Store hint (may be empty): ${storeHint || "none"}
Currency hint (may be empty): ${currencyHint || "CAD"}
`;

  const body = {
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt.trim() },
      { role: "user", content: userPrompt.trim() },
    ],
    max_tokens: 900,
    temperature: 0.1,
  };

  const resp = await doFetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("Groq receipt error:", resp.status, txt.slice(0, 300));
    throw new Error(`Groq API error ${resp.status}`);
  }

  const raw = await resp.json();
  const content = raw?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq response missing content");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error("Failed to parse Groq JSON:", e, content.slice(0, 300));
    throw new Error("Groq returned invalid JSON");
  }

  return parsed;
}

// Optional small post-processing to avoid crazy numbers
function sanitizeReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") return null;

  const safeNum = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (Math.abs(n) > 10000) return null; // protect against insane values
    return parseFloat(n.toFixed(2));
  };

  const out = {
    storeName: receipt.storeName || null,
    storeLocation: receipt.storeLocation || null,
    purchaseDate: receipt.purchaseDate || null,
    currency: receipt.currency || "CAD",
    subtotal: safeNum(receipt.subtotal),
    tax: safeNum(receipt.tax),
    total: safeNum(receipt.total),
    notes: receipt.notes || "",
  };

  out.lineItems = Array.isArray(receipt.lineItems)
    ? receipt.lineItems
        .map((it) => {
          if (!it || typeof it !== "object") return null;
          const name = (it.name || "").toString().trim();
          if (!name) return null;

          return {
            name,
            quantity: safeNum(it.quantity) || 1,
            unitPrice: safeNum(it.unitPrice),
            lineTotal: safeNum(it.lineTotal),
            rawLine: (it.rawLine || "").toString().slice(0, 200),
          };
        })
        .filter(Boolean)
    : [];

  return out;
}

// ----- Main handler -----
module.exports = async function receiptParseHandler(req, res) {
  if (req.method !== "POST") {
    if (res.setHeader) res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const { rawText, storeHint, currencyHint } = body;
    if (!rawText || typeof rawText !== "string") {
      return res
        .status(400)
        .json({ error: "rawText (OCR text) is required in request body" });
    }

    console.log("[receipt-parse] text length:", rawText.length);

    const groqResult = await callGroqForReceipt(
      rawText,
      storeHint,
      currencyHint
    );
    const clean = sanitizeReceipt(groqResult);

    if (!clean) {
      return res.status(500).json({ error: "Could not parse receipt" });
    }

    return res.status(200).json({
      success: true,
      receipt: clean,
    });
  } catch (err) {
    console.error("Receipt parse error:", err);
    return res
      .status(500)
      .json({ error: "Server error parsing receipt", details: err.message });
  }
};
