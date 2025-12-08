// api/ai/mealplan.js

// Model + API key from environment
const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Use global fetch if available (Node 18+ / Vercel), otherwise fall back to node-fetch
let doFetch = global.fetch;
if (!doFetch) {
  doFetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));
}

// Call Groq Chat Completions and return parsed JSON object
async function callGroq(dish, allergies, servings) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not configured on the server. Set it in your .env and Vercel env."
    );
  }

  const systemPrompt = `
Return valid JSON only.

The response MUST match exactly this structure:

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
      "steps": ["string"]
    }
  ]
}

Rules:
- ingredients must be an array of objects, NOT strings.
- Do not include any plain strings like "[object Object]".
- Do not include markdown.
`;

  const userPrompt = `
Dish: ${dish}
Avoid: ${allergies || "none"}
Servings: ${servings || 2}
`;

  const body = {
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt.trim() },
      { role: "user", content: userPrompt.trim() },
    ],
    max_tokens: 700,
    temperature: 0.3,
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

  const raw = await resp.json().catch(() => null);

  // If Groq itself returned an error
  if (!resp.ok) {
    const message =
      raw?.error?.message ||
      raw?.error ||
      `Groq API request failed with status ${resp.status}`;
    console.error("Groq API error:", raw);
    throw new Error(message);
  }

  const content = raw?.choices?.[0]?.message?.content;
  if (!content) {
    console.error("Groq unexpected response:", raw);
    throw new Error("Missing 'content' in Groq response");
  }

  // content should be a JSON string because of response_format=json_object
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("Failed to parse Groq JSON content:", content);
    throw new Error("Could not parse Groq JSON: " + e.message);
  }
}

// Normalize to a clean structure for the front-end
function normalizeRecipes(parsed, requestedServings) {
  const recipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];

  return recipes.map((r, idx) => ({
    id: idx,
    title: r.title || `Recipe ${idx + 1}`,
    servings: Number(r.servings) || requestedServings || 2,
    description: r.description || "",
    ingredients: Array.isArray(r.ingredients)
      ? r.ingredients.filter(
          (ing) =>
            ing &&
            typeof ing === "object" &&
            (ing.name || ing.ingredient || ing.item)
        )
      : [],
    steps: Array.isArray(r.steps) ? r.steps.map(String) : [],
  }));
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { dish, allergies, servings } = req.body || {};
    if (!dish || !dish.trim()) {
      return res.status(400).json({ error: "Dish required" });
    }

    const raw = await callGroq(dish.trim(), allergies, servings);
    const recipes = normalizeRecipes(raw, servings);

    return res.status(200).json({ recipes });
  } catch (err) {
    console.error("Mealplan AI error:", err);
    // Clear, user-visible error message
    return res.status(500).json({ error: err.message || "AI mealplan error" });
  }
};
