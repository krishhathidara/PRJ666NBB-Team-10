// /api/ai/mealplan.js
// Uses Groq to generate 1–2 recipe options for a given dish + allergies.

const { getUserFromReq } = require("../_auth");

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

// Simple heuristic defaults when Groq gives a unit but no quantity
function normalizeQuantity(rawQuantity, unit) {
  if (typeof rawQuantity === "number" && Number.isFinite(rawQuantity)) {
    return rawQuantity;
  }
  if (!unit) return null;

  const u = String(unit).toLowerCase().trim();

  if (u === "g" || u === "gram" || u === "grams") return 200;      // 200 g
  if (u === "kg" || u === "kilogram" || u === "kilograms") return 0.5; // 0.5 kg
  if (u === "ml") return 100;                                       // 100 ml
  if (u.includes("cup")) return 1;                                  // 1 cup
  if (u.includes("tbsp")) return 1;                                 // 1 tbsp
  if (u.includes("tsp")) return 0.5;                                // 0.5 tsp
  if (u.includes("clove")) return 2;                                // 2 cloves
  if (u.includes("piece") || u.includes("pc")) return 1;            // 1 piece

  // Fallback: at least 1 of whatever the unit is
  return 1;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = getUserFromReq(req);
  if (!user || !user.email) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY missing on this deployment");
    return res.status(500).json({ error: "AI not configured on server" });
  }

  try {
    const { dish, allergies = [], servings } = req.body || {};

    if (!dish || typeof dish !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'dish' field" });
    }

    const requestedServings = Math.max(
      1,
      Math.min(12, parseInt(servings, 10) || 2)
    );

    const allergyText =
      Array.isArray(allergies) && allergies.length
        ? allergies.join(", ")
        : "none";

    // ===== Call Groq =====
    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0.4,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful recipe generator for a grocery web app.\n" +
                "ALWAYS respond with STRICT JSON only, no extra text.\n" +
                'Format:\n{"recipes":[{\n' +
                '  "title":string,\n' +
                '  "description":string,\n' +
                '  "time_minutes":number,\n' +
                '  "servings":number,\n' +
                '  "ingredients":[{"name":string,"quantity":number|null,"unit":string|null,"notes":string|null}],\n' +
                '  "steps":[string]\n' +
                "}]}",
            },
            {
              role: "user",
              content:
                `Create 1 or 2 recipe options for: "${dish}". ` +
                `Avoid these allergens or ingredients: ${allergyText}. ` +
                `Each recipe MUST serve exactly ${requestedServings} people.\n\n` +
                "For every ingredient where a realistic numeric amount is possible, " +
                'you MUST provide a non-null "quantity" (number) AND "unit" (e.g. g, ml, cup, tbsp).\n' +
                "Examples of valid ingredients:\n" +
                '{"name":"paneer","quantity":200,"unit":"g","notes":null}\n' +
                '{"name":"butter","quantity":2,"unit":"tbsp","notes":null}\n' +
                '{"name":"salt","quantity":null,"unit":null,"notes":"to taste"}\n' +
                'Only use null for quantity when it truly has no fixed amount like "salt to taste".\n' +
                "Use common grocery ingredients available in Canada. Keep the recipe suitable for home cooking.",
            },
          ],
        }),
      }
    );

    if (!groqRes.ok) {
      const text = await groqRes.text();
      console.error("Groq API error:", groqRes.status, text.slice(0, 200));
      return res
        .status(502)
        .json({ error: "AI service returned an error", details: text });
    }

    const data = await groqRes.json();
    const content =
      data.choices?.[0]?.message?.content?.trim() || '{"recipes":[]}';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse Groq JSON content:", content);
      return res
        .status(502)
        .json({ error: "AI response was not valid JSON", raw: content });
    }

    if (!parsed || !Array.isArray(parsed.recipes)) {
      return res
        .status(502)
        .json({ error: "AI response missing recipes array", raw: parsed });
    }

    // ===== Sanitize & normalize =====
    const recipes = parsed.recipes.slice(0, 2).map((r, idx) => {
      const safeIngredients = Array.isArray(r.ingredients)
        ? r.ingredients.map((ing) => {
            const name = String(ing.name || "").trim();
            const unit = ing.unit ? String(ing.unit).trim() : null;
            let quantity = normalizeQuantity(ing.quantity, unit);
            const notes = ing.notes ? String(ing.notes).trim() : null;

            return { name, quantity, unit, notes };
          })
        : [];

      const steps = Array.isArray(r.steps)
        ? r.steps.map((s) => String(s).trim())
        : [];

      return {
        id: idx,
        title: String(r.title || `Recipe ${idx + 1}`),
        description: String(r.description || ""),
        time_minutes: Number(r.time_minutes || 0),
        // Force servings to whatever the user picked
        servings: requestedServings,
        ingredients: safeIngredients,
        steps,
      };
    });

    return res.status(200).json({ recipes });
  } catch (err) {
    console.error("AI mealplan handler error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
};
