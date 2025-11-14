// api/ai/mealplan.js
//
// AI-powered meal plan generator using Groq.
// Works both on Vercel (serverless) and with server.local.js (Express).

const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Use Node's global fetch when available, otherwise fall back to node-fetch
let doFetch = global.fetch;
if (!doFetch) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  doFetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));
}

/**
 * Call Groq and get raw assistant content.
 */
async function callGroq(dish, allergies, servings) {
  const systemPrompt = `
You are a professional recipe developer. 
Return ONLY strict JSON. Do not include backticks or any extra text.

JSON SCHEMA (exact shape):

{
  "recipes": [
    {
      "title": "string",
      "servings": number,
      "description": "string",
      "ingredients": [
        {
          "name": "string",
          "quantity": number,
          "unit": "string"
        }
      ],
      "steps": ["string", "..."]
    }
  ]
}

RULES:
- Use realistic quantities, always numeric for "quantity" (e.g. 250, 1.5, 0.25).
- "unit" must be something like "g", "ml", "tbsp", "tsp", "cup", "piece", etc.
- Scale quantities to match the requested servings exactly.
- Respect allergy / avoidance list (do NOT use those ingredients).
- Return 1–2 recipe options.
`;

  const userPrompt = `
Dish or cuisine: ${dish || "any"}
Servings: ${servings || 2}
Allergies / avoid: ${allergies || "none"}
`;

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt.trim() },
      { role: "user", content: userPrompt.trim() },
    ],
    max_tokens: 900,
    temperature: 0.7,
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

  const text = await resp.text();

  if (!resp.ok) {
    // Surface Groq error text up to 400 chars
    throw new Error(`Groq HTTP ${resp.status}: ${text.slice(0, 400)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Groq top-level JSON parse failed: ${err.message}`);
  }

  const content =
    json.choices?.[0]?.message?.content?.trim() ||
    (() => {
      throw new Error("Groq response missing message content");
    })();

  // Extract JSON from content (in case the model wraps it in text)
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(
      "Groq content was not pure JSON. Got: " + content.slice(0, 200)
    );
  }

  const inner = content.slice(start, end + 1);

  let parsed;
  try {
    parsed = JSON.parse(inner);
  } catch (err) {
    throw new Error(
      `Groq inner JSON parse failed: ${err.message} in: ${inner.slice(
        0,
        200
      )}`
    );
  }

  return parsed;
}

/**
 * Normalize recipes: ensure numeric servings, clean ingredient fields, etc.
 */
function normalizeRecipes(parsed, requestedServings) {
  let recipes = parsed?.recipes;
  if (!Array.isArray(recipes)) {
    // Sometimes model might just return an array
    if (Array.isArray(parsed)) recipes = parsed;
    else recipes = [];
  }

  const targetServings = Number(requestedServings) || 2;

  return recipes.map((r, idx) => {
    const servings = Number(r.servings) || targetServings;

    const ingredients = Array.isArray(r.ingredients)
      ? r.ingredients
          .map((ing) => {
            const name = (ing.name || ing.ingredient || "").toString().trim();
            if (!name) return null;

            let qty = Number(ing.quantity);
            if (!Number.isFinite(qty)) qty = 1;

            const unit = (ing.unit || ing.measure || "").toString().trim();

            return { name, quantity: qty, unit };
          })
          .filter(Boolean)
      : [];

    return {
      id: idx,
      title: r.title || `Recipe ${idx + 1}`,
      servings,
      description: r.description || "",
      ingredients,
      steps: Array.isArray(r.steps) ? r.steps.map(String) : [],
    };
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method && req.method !== "POST") {
      if (res.setHeader) res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!GROQ_API_KEY) {
      console.error("❌ GROQ_API_KEY missing in environment");
      return res.status(500).json({
        error:
          "AI is not configured on this deployment (GROQ_API_KEY is missing).",
      });
    }

    // Body may be already parsed (Express) or a string (Vercel)
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }
    body = body || {};

    const dish = (body.dish || "").trim();
    const allergies = (body.allergies || "").trim();
    const servings = Number(body.servings) || 2;

    if (!dish) {
      return res.status(400).json({ error: "Dish / cuisine is required." });
    }

    const raw = await callGroq(dish, allergies, servings);
    const recipes = normalizeRecipes(raw, servings);

    return res.status(200).json({
      recipes,
      source: "groq",
      model: MODEL,
    });
  } catch (err) {
    console.error("AI mealplan handler error:", err);
    const msg = err && err.message ? err.message : String(err);

    // ALWAYS return JSON so front-end's res.json() never breaks
    return res.status(500).json({
      error: "AI service failed",
      details: msg.slice(0, 400),
    });
  }
};
