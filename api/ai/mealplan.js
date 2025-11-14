// api/ai/mealplan.js
const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

let doFetch = global.fetch;
if (!doFetch) {
  doFetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));
}

async function callGroq(dish, allergies, servings) {
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
Servings: ${servings}
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

  const resp = await doFetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await resp.json();

  const content = raw?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Missing content from Groq");

  return JSON.parse(content);
}

function normalizeRecipes(parsed, requestedServings) {
  const recipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];

  return recipes.map((r, idx) => ({
    id: idx,
    title: r.title || `Recipe ${idx + 1}`,
    servings: Number(r.servings) || requestedServings || 2,
    description: r.description || "",
    ingredients: Array.isArray(r.ingredients)
      ? r.ingredients.filter(ing =>
          ing && typeof ing === "object" && ing.name
        )
      : [],
    steps: Array.isArray(r.steps) ? r.steps.map(String) : [],
  }));
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    const { dish, allergies, servings } = req.body || {};
    if (!dish) return res.status(400).json({ error: "Dish required" });

    const raw = await callGroq(dish, allergies, servings);
    const recipes = normalizeRecipes(raw, servings);

    res.status(200).json({ recipes });
  } catch (err) {
    console.error("Mealplan AI error:", err);
    res.status(500).json({ error: err.message });
  }
};
